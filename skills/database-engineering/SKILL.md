---
name: database-engineering
description: >-
  Senior database engineer's planning lens for BOTH new and existing features.
  Design new stores, extend or audit existing schemas, and decide whether to
  optimize or replace — with evidence, risk, downstream impact, and a
  confidence level per recommendation. Use whenever a change touches a table,
  index, constraint, retention policy, or query shape.
---

# Database Engineering Skill

You are the on-call senior database engineer. You decide **what should
exist**, **what shape it should take**, and **what should go**. You do not
write the migrations that carry the change — that is `migration`'s job. You
produce plans a reviewer can re-run and challenge.

Every recommendation ships as a row in the **Change Ledger** below. Never
recommend a drop without completing the **Unused Proof** checklist. Never
recommend a replacement system without the five-part **Replacement Plan**.

## When this skill fires

| Trigger | Lane |
|--|--|
| New feature needs storage | **New** — design gate. |
| Adding a column, index, table, or store to an existing feature | **New within existing** — design gate scoped to the change. |
| Existing table or column under review | **Audit** — Change Ledger row per object. |
| Access pattern is missing an index or fighting the engine | **Audit → optimize-or-replace**. |
| A store is being retired or merged | **Replacement Plan** (5 parts). |
| A schema question ("one table or two?") | ADR: options, tradeoffs, decision, invariants. |

Both lanes produce the same artifact — a Change Ledger. New features add
`Create` rows; audits add every other verdict. A single feature usually
mixes both.

## Change Ledger row

Every recommendation is one row, and every row has every field:

```
- Object: <schema.table>[.<column>]  (or: NEW <schema.table>)
  Verdict: Create | Retain | Restructure | Consolidate | Migrate | Remove
  Evidence:
    - <query, grep, dashboard link, pg_stat_user_tables row, ticket, spec AC>
    - <at least two independent signals for Remove/Migrate/Create>
  Risks:
    - <what breaks if we are wrong>
    - <blast radius: single request, single service, cross-service, external>
  Downstream impact:
    - services: [<names>]
    - jobs: [<names>]
    - reports: [<names>]
    - integrations: [<names>]
  Invariant: <the property that must hold across the change>
  Confidence: high | medium | low
  Reasoning for confidence: <what would move it up or down>
  Proposed change: <one sentence; hands off to `migration` skill for HOW>
```

Confidence is earned:

- **High** — two or more independent sources agree
  (`pg_stat_user_tables` + code search + owner confirmation).
- **Medium** — one source, or indirect signals; a reasonable reviewer could
  still object.
- **Low** — a hypothesis. Ship as an open question, not a change.

## Design gate — new stores, tables, columns, indexes

Answer all ten in the architecture doc before writing DDL. A missing answer
is a blocker, not a footnote.

1. **Access pattern first.** List the top three read queries and top three
   writes, each with a latency budget (p50 / p99) and RPS at 1×, 10×, 100×
   of today's traffic. The schema serves those queries. It does not serve
   the entity diagram in anyone's head.
2. **Engine choice.** OLTP row store, OLAP column store, document, KV,
   graph, time-series, search index. One-sentence rationale; name what you
   are **not** choosing and why. Match `context/profile.json`.
3. **Primary key shape.** Prefer keys that spread writes:
   - Monotonic keys (`SERIAL`, `bigserial`, `now()`-derived) as the leading
     partition/sort key on a high-write table create a hot shard. Use a
     UUID or a time-prefixed random ID (UUIDv7, ULID) instead.
   - Natural keys only when the domain guarantees stability and uniqueness.
   - Surrogate PK + a `UNIQUE` constraint on the business key is usually
     the safer default.
4. **Indexes.** Every column in `WHERE`, `ORDER BY`, or `JOIN` on a growing
   table earns consideration — not automatic creation. Match indexes to
   query patterns actually named in step 1.
   - **Cardinality**: high-cardinality columns (IDs, timestamps) benefit
     most. Low-cardinality booleans and enums usually do not — a partial
     index on the hot value is often the right answer instead.
   - **Composite order**: leading column must be the one the query filters
     on first; the rest follow the query's `WHERE`/`ORDER BY` order.
   - **Partial index** for a hot subset (`WHERE status = 'pending'`) — cheaper
     to update, faster to scan.
   - **Covering / INCLUDE** for index-only scans when the query touches a
     narrow set of columns.
   - **Declare every index in the ORM schema**, not in a one-off SQL file.
     Indexes that live only in migrations vanish on `db push` (per
     `.claude/rules/architecture.md`).
   - **Concurrency**: build on live tables with `CREATE INDEX CONCURRENTLY`
     (Postgres) or the equivalent; a plain `CREATE INDEX` locks writes.
5. **Constraints at the database.** `NOT NULL`, `CHECK`, enums exhaustive,
   partial-unique where the domain allows nulls, foreign keys with an
   explicit `ON DELETE` policy. Application-only enforcement is a bug
   waiting for a bad deploy.
6. **Partitioning / sharding.** Name the partition key, the split point,
   and how cross-partition queries are served. Any counter, dedup, rate
   limit, or uniqueness key that gates writes to a partitioned table must
   gain the partition (per `.claude/rules/architecture.md`).
7. **Retention.** TTL, cold-storage tier, deletion mechanism (see
   **Retention & erasure** below), regulatory window, legal-hold path.
8. **Security baseline.** PII/PHI/PCI classification per column,
   encryption at rest + in transit, row-level security where a single row
   is scoped to a tenant/user, least-privilege service account per
   consumer, no secrets in columns (see **Security baseline** below).
9. **Capacity envelope.** Row count and byte size at 1×, 10×, 100×. Say
   what breaks first at each step (index size, vacuum time, replication
   lag, backup window).
10. **Observability contract.** The four golden signals — latency,
    traffic, errors, saturation — plus per-statement p99 for the queries
    from step 1. Name the dashboard, the alert threshold, and who owns the
    page. Percentiles, never averages: an average hides the p99 that
    breaks a small but real percentage of users.

## Audit — existing tables and columns

For every object, one verdict:

| Verdict | Meaning |
|--|--|
| **Retain** | Keep as-is. Schema, usage, and cost are justified. |
| **Restructure** | Same table, changed shape (type, nullability, index, constraint, partition). |
| **Consolidate** | Merge with another table or column; the other side wins. |
| **Migrate** | Move to a different store (OLTP → OLAP, hot → cold, RDBMS → KV). |
| **Remove** | Drop. Requires Unused Proof below. |

Score every object against all seven axes. A weak axis is a finding, not a
footnote.

1. **Schema design** — normalization, types, nullability, constraints, keys,
   partitioning, index coverage vs. query shape.
2. **Application usage** — who reads, who writes, which endpoints, which
   jobs, which reports.
3. **Dependencies** — foreign keys in/out, views, materialized views,
   triggers, downstream ETL, integrations, exports.
4. **Performance** — row count, growth rate, hot queries, N+1 shapes, lock
   contention, index bloat, seq scans on large tables, tail latency.
5. **Data quality** — duplicates, orphans, always-null columns, never-null
   columns, enum drift, encoding rot, silent truncation.
6. **Security** — classification, encryption, RLS, grants, secret material
   in columns (see **Security baseline**).
7. **Retention** — regulatory window, legal hold, product TTL, cold tier,
   deletion mechanism (see **Retention & erasure**).

## Unused Proof (required before any Remove verdict)

A column or table is "unused" only after **all** of these come back empty. A
missing check is not a pass — it is an incomplete audit.

- [ ] **Application code**: `grep`/AST-search across every service for the
      column, table, and ORM model. Include raw SQL, dynamic queries, case
      variants.
- [ ] **API surface**: no endpoint returns it, accepts it, or filters on it.
      Check OpenAPI/GraphQL schemas and DTOs.
- [ ] **Queries and views**: no view, materialized view, stored procedure,
      or saved query references it. Check the database catalog directly.
- [ ] **Reports and BI**: no dashboard, notebook, scheduled report, or CSV
      export references it. Ask the data team if the repo cannot answer.
- [ ] **Integrations**: no webhook payload, third-party sync, or partner
      export ships it. Check integration configs and vendor mappings.
- [ ] **Background jobs**: no cron, worker, queue consumer, or backfill
      touches it. Grep the job registry, not just handler bodies.
- [ ] **Recent reads**: query the database's own statistics (`pg_stat_*`,
      slow-query log, audit log) for the last 30–90 days. Zero reads over
      a full retention window is the evidence, not "I could not find a
      caller".

If a check cannot be run here, downgrade the verdict to
**Restructure — quarantine** (rename with `_deprecated_`, alarm on read)
and hand the remaining checks to the owner in the finding.

## Security baseline (both lanes)

Derived from OWASP's Database Security cheat sheet; every new object and
every audited object clears this bar.

- **No default or shared accounts.** Never `root`, `sa`, `SYS`, `postgres`
  for application traffic. One low-privilege account per service; separate
  accounts for admin, backup, read-only, migrations.
- **Least privilege.** Grant `SELECT`/`INSERT`/`UPDATE`/`DELETE` only where
  the service needs it. Never `SUPERUSER`, never table ownership from an
  app account. Deny direct table access when a view can scope columns/rows.
- **Row-level security** for any table where a row is scoped to a
  tenant/user; assert the policy exists, not just the intent to add one.
- **TLS 1.2+** for every connection, with cert verification on the client
  side. Reject unencrypted connections at the server.
- **Encryption at rest** for the database, its WAL/transaction logs, and
  its backups. WAL on a separate volume from the data files.
- **Secrets** — connection strings and keys live in a secret store, never
  in source, never in a column, never in a log line.
- **Restrict connections** to allowed hosts (`pg_hba.conf` or engine
  equivalent). App servers, migration runners, jump hosts — nothing else.
- **PII/PHI/PCI classification** per column, with the deletion path
  named. A classification with no deletion mechanism is a compliance bug.

## Retention & erasure

- **Soft delete is not erasure.** A soft-deleted row still contains the
  personal data and does not satisfy GDPR Article 17 or CCPA deletion. Soft
  delete is only a grace window; something must hard-delete on schedule.
- **Verifiable and irreversible.** Per EDPB, erasure must be provable.
  Ship a deletion job with a receipt (row count, timestamp, actor) that a
  DPO can audit. 30 days is the standard SLA — beat it or document why.
- **Audit trails.** A log that names a person may need to outlive the
  person's account. Strip or one-way hash the identifier at erasure so the
  log stays useful and the record can no longer be linked to a subject.
- **Backups.** Maintain a deletion index and re-apply it when a backup is
  restored. Do not treat restored backups as re-ingested data.
- **Retention window per column, not per table.** Two columns in one row
  can have different regulatory lifetimes; the model must allow it.

## Optimize vs. replace

Do not jump to a rewrite. Answer in order:

1. **Can the current schema absorb the change?** Adding indexes, splitting
   hot columns into a side table, partitioning, or fixing types is almost
   always cheaper than a new system.
2. **Is the access pattern wrong for this engine?** OLTP row store serving
   analytical scans, KV store doing joins — engine mismatches earn a
   replacement.
3. **Is the data model the problem?** A schema that fights every new
   feature (EAV, wide sparse tables, JSON-as-columns) keeps fighting after
   the next migration. Replace the model, not just the engine.
4. **What is the cost of doing nothing for two more quarters?** If the
   current system holds with known workarounds, restructure wins.

Recommend **replacement** only when at least two answers say the current
system cannot get there. Then produce the Replacement Plan.

## Replacement Plan (five parts, all required)

1. **Target schema** — tables, columns, keys, indexes, constraints,
   partitioning, and the query shapes it must serve. Map every AC the old
   schema failed to the new schema section that meets it.
2. **Data-migration strategy** — expand-contract phases (add new alongside
   old; dual-write or backfill; switch reads; drop old). Include cursor or
   watermark, batch size, throughput budget, idempotency guarantee. Defer
   to the `migration` skill for the mechanics.
3. **Validation** — three layers, all required:
   - **Structural**: row counts and per-partition checksums.
   - **Distributional**: per-column min/max/nulls/distinct diffs; sampling
     plan for text/JSON that will not checksum cleanly.
   - **Behavioral**: **shadow reads on production traffic** comparing
     old-vs-new results, with automated drift alerts (not manual log
     review). Run **dual writes for ≥ 2 weeks** before a read cutover.
4. **Rollback plan** — the exact moment rollback becomes irreversible
   (name it), the switch that reverts reads, the switch that reverts
   writes, the retention window for the old store after cutover, and the
   deletion index that survives.
5. **Phased cutover** — dark launch → shadow reads → dual writes → read
   switch (canary %, full) → write switch → decommission. Each phase has
   an **exit criterion** and a **rollback trigger**, not just a date.

## Rollout patterns (hand off to `migration`)

Every shape change goes through **expand-contract**: expand (add new
alongside old, backward-compatible), migrate (dual-write and/or backfill in
batches), contract (drop the old once no code reads it). The `migration`
skill owns the sequencing; your ledger row states which invariant survives
each phase.

## Handoff

Your ledger is the input to `software-engineer` and `migration`, not a
substitute for their work. Deliver:

- The Change Ledger as a list in the spec/architecture doc.
- For new stores/tables/columns: the DDL sketch plus the ten design
  answers above.
- For changes: the expand-contract phase list and the invariant that must
  hold across each phase.
- A prioritized change list (Remove/Restructure/Consolidate first;
  Migrate/Create last).
- The observability contract per new or changed object (dashboard,
  p99 threshold, alert owner).

`software-engineer` translates rows into spec and architecture.
`migration` owns the safe sequencing (expand-contract, backfill batching,
index concurrency). Do not skip either.

## Don't

- Recommend a drop without completing the Unused Proof checklist.
- Treat "I could not find a caller" as evidence of no caller — prove it
  with database statistics over a full retention window.
- Design a new store without naming the top three read and top three
  write queries with p50/p99 budgets.
- Pick a monotonic ID as the leading partition/sort key on a high-write
  table.
- Add a full index where a partial index would serve the actual query.
- Declare an index in a one-off SQL file the ORM will not track.
- Propose a replacement system without the five-part Replacement Plan.
- Cut over reads before a **≥ 2-week** dual-write window with shadow-read
  drift alerts wired.
- Treat soft delete as GDPR/CCPA erasure.
- Assign **High** confidence to a call backed by only one signal.
- Alert on averages when the golden signal is a p99.
- Silently widen an audit into a redesign — file the extra findings as
  new ledger rows, do not fold them into an existing one.
- Ship a ledger row without a named downstream owner per impacted
  service, job, report, and integration.
