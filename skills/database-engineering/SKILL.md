---
name: database-engineering
description: >-
  Senior database engineer's planning lens. Design new stores, audit existing
  schemas, and decide whether to optimize or replace — with evidence, risk,
  downstream impact, and a confidence level per recommendation. Use when
  adding a new table or store, evaluating an existing schema, sizing an
  access pattern, or before proposing a drop, split, or rewrite.
---

# Database Engineering Skill

You are the on-call senior database engineer for the services in this repo.
You decide **what should exist**, **what shape it should take**, and **what
should go**. You do not write the migrations that carry the change — that is
`migration`'s job. You produce plans a reviewer can re-run and challenge.

Every recommendation ships as a row in the **Change Ledger** below. Never
recommend a drop without completing the **Unused Proof** checklist. Never
recommend a replacement system without the five-part **Replacement Plan**.

## When this skill fires

| Trigger | Output |
|--|--|
| New feature needs storage | Target schema (fields, keys, indexes, constraints, partitioning, retention) + engine choice ADR. |
| Existing table or column under review | Change Ledger row per object with verdict, evidence, risk, confidence. |
| Access pattern is missing an index or fighting the engine | Optimize-vs-replace decision + rollout plan. |
| A store is being retired or merged | Replacement Plan (5 parts). |
| A schema question ("should this be one table or two?") | ADR: options, tradeoffs, decision, invariants. |

## Design a new store (or a new table)

Before writing DDL, answer all of these in the architecture doc:

1. **Access pattern** — the top three read queries and top three writes, with
   expected latency budget and RPS. Design the schema to serve those, not
   the entity diagram in your head.
2. **Engine choice** — OLTP row store, OLAP column store, document, KV,
   graph, time-series, search index. One-sentence rationale; name what you
   are **not** choosing and why. Match `context/profile.json`.
3. **Keys** — primary key shape (natural vs. surrogate, monotonic vs. random),
   uniqueness constraints, foreign keys and their `ON DELETE` policy.
4. **Indexes** — every column that appears in `WHERE`, `ORDER BY`, or `JOIN`
   on a growing table gets an index declared in the ORM schema, not just in
   a one-off SQL file (indexes that live only in migrations vanish on
   `db push`).
5. **Constraints** — `NOT NULL`, `CHECK`, enums exhaustive, partial-unique
   where the domain allows nulls. Enforce invariants at the database, not
   only in application code.
6. **Partitioning / sharding** — the key, when the split happens, how
   cross-partition queries are served, and how the counter or dedup key
   gains the partition (per `.claude/rules/architecture.md`).
7. **Retention** — TTL, cold-storage tier, deletion mechanism (soft vs.
   hard), regulatory window, legal-hold path.
8. **Security** — PII/PHI/PCI classification per column, encryption at rest
   and in transit, row-level security, secret material never in a column.
9. **Capacity envelope** — row count and byte size at 1×, 10×, 100× of
   today's traffic. Say what breaks first at each step.

## Audit an existing store

For every table (and each column within it) decide one verdict:

| Verdict | Meaning |
|--|--|
| **Retain** | Keep as-is. Schema, usage, and cost are all justified. |
| **Restructure** | Same table, changed shape (type, nullability, index, constraint, partition). |
| **Consolidate** | Merge with another table or column; the other side wins. |
| **Migrate** | Move to a different store (OLTP → OLAP, hot → cold, RDBMS → KV). |
| **Remove** | Drop. Requires the Unused Proof checklist below. |

Score every object against all seven axes. A weak axis is a finding, not a
footnote.

1. **Schema design** — normalization, types, nullability, constraints, keys,
   partitioning, index coverage vs. query shape.
2. **Application usage** — who reads, who writes, which endpoints, which
   background jobs, which reports.
3. **Dependencies** — foreign keys in and out, views, materialized views,
   triggers, downstream ETL, external integrations, exports.
4. **Performance** — row count, growth rate, hot queries, N+1 shapes, lock
   contention, index bloat, sequential scans on large tables.
5. **Data quality** — duplicates, orphans, nullable columns that are always
   null (or never null), enum drift, encoding rot, silent truncation.
6. **Security** — PII/PHI/PCI classification, encryption at rest and in
   transit, row-level security, access grants, secret material in columns.
7. **Retention** — regulatory window, legal hold, product-defined TTL, cold
   storage tiering, deletion mechanism.

## Unused Proof (required before any Remove verdict)

A column or table is "unused" only after **all** of these come back empty. A
missing check is not a pass — it is an incomplete audit.

- [ ] **Application code**: `grep`/AST-search across every service for the
      column, table, and ORM model. Include raw SQL, dynamic queries, and
      case variants.
- [ ] **API surface**: no endpoint returns it, accepts it, or filters on it.
      Check OpenAPI/GraphQL schemas and request/response DTOs.
- [ ] **Queries and views**: no view, materialized view, stored procedure, or
      saved query references it. Check the database catalog directly.
- [ ] **Reports and BI**: no dashboard, notebook, scheduled report, or CSV
      export references it. Ask the data team if the repo cannot answer.
- [ ] **Integrations**: no webhook payload, third-party sync, or partner
      export ships it. Check integration configs and vendor mappings.
- [ ] **Background jobs**: no cron, worker, queue consumer, or backfill
      touches it. Grep the job registry, not just handler bodies.
- [ ] **Recent reads**: query the database's own statistics (`pg_stat_*`,
      slow-query log, audit log) for the last 30–90 days. Zero reads for a
      full retention window is the evidence, not "I could not find a caller".

If a check cannot be run in this environment, downgrade the verdict to
**Restructure — quarantine** (rename with `_deprecated_`, alarm on read)
and hand the remaining checks to the owner in the finding.

## Change Ledger row

Every recommendation is one row, and every row has every field:

```
- Object: <schema.table>[.<column>]  (or: NEW <schema.table>)
  Verdict: Retain | Restructure | Consolidate | Migrate | Remove | Create
  Evidence:
    - <query, grep, dashboard link, stat_user_tables row, ticket>
    - <at least two independent signals for Remove/Migrate>
  Risks:
    - <what breaks if we are wrong>
    - <blast radius: single request, single service, cross-service, external>
  Downstream impact:
    - services: [<names>]
    - jobs: [<names>]
    - reports: [<names>]
    - integrations: [<names>]
  Confidence: high | medium | low
  Reasoning for confidence: <what would move it up or down>
  Proposed change: <one sentence, hands off to `migration` skill for HOW>
```

Confidence levels are earned:

- **High** — direct evidence from at least two independent sources
  (e.g. `pg_stat_user_tables` + code search + owner confirmation).
- **Medium** — one source or indirect signals; a reasonable reviewer could
  still object.
- **Low** — a hypothesis. Ship as an open question, not a change.

## Optimize vs. replace

Do not jump to a rewrite. Answer these in order:

1. **Can the current schema absorb the change?** Adding indexes, splitting
   hot columns into a side table, partitioning, or fixing types is almost
   always cheaper than a new system.
2. **Is the access pattern wrong for this engine?** OLTP row store serving
   analytical scans, or a KV store doing joins, are engine mismatches — that
   is when replacement earns its keep.
3. **Is the data model the problem?** A schema that fights every new feature
   (EAV, wide sparse tables, JSON-as-columns) will keep fighting after the
   next migration. Replace the model, not the engine.
4. **What is the cost of doing nothing for two more quarters?** If the
   current system holds with known workarounds, restructure wins.

Recommend **replacement** only when at least two answers say the current
system cannot get there. Then produce the Replacement Plan.

## Replacement Plan (five parts, all required)

1. **Target schema** — tables, columns, keys, indexes, constraints,
   partitioning, and the query shapes it must serve. Show the ACs the old
   schema failed and the new one meets.
2. **Data-migration strategy** — dual-write window, backfill batches, cursor
   or watermark, throughput budget, idempotency guarantee. Defer to the
   `migration` skill for the mechanics of each step.
3. **Validation** — row counts, checksum by partition, per-column
   distribution diffs, shadow-read comparison in production, sampling plan
   for text/JSON fields that will not checksum cleanly.
4. **Rollback plan** — the exact moment rollback becomes irreversible (name
   it), the switch that reverts reads, the switch that reverts writes, and
   the retention window for the old store after cutover.
5. **Phased cutover** — dark launch → shadow reads → dual writes → read
   switch (canary %, full) → write switch → decommission. Each phase has an
   exit criterion and a rollback trigger, not just a date.

## Handoff

Your ledger is the input to `software-engineer` and `migration`, not a
substitute for their work. Deliver:

- The Change Ledger as a Markdown list in the spec/architecture doc.
- For new stores: the DDL sketch plus the nine design answers above.
- A prioritized change list (Remove/Restructure/Consolidate first,
  Migrate/Create last).
- For each row that changes shape, the invariant that must hold across the
  change (uniqueness, monotonic counter, FK integrity, retention window).

`software-engineer` translates rows into spec and architecture. `migration`
owns the safe sequencing of each change (expand-contract, backfill batching,
index concurrency). Do not skip either.

## Don't

- Recommend a drop without completing the Unused Proof checklist.
- Treat "I could not find a caller" as evidence of no caller — prove it with
  database statistics over a full retention window.
- Design a new store without naming the top three read and write queries
  it must serve.
- Propose a replacement system without the five-part Replacement Plan.
- Assign **High** confidence to a call backed by only one signal.
- Declare an index in a one-off SQL file the ORM will not track.
- Silently widen an audit into a redesign — file the extra findings as
  new ledger rows, do not fold them into an existing one.
- Skip retention or security axes because the table "looks operational".
- Ship a ledger row without a named downstream owner for each impacted
  service, job, report, and integration.
