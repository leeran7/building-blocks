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
recommend a drop without completing **Unused Proof** (`audit.md`). Never
recommend a replacement system without the five-part plan
(`replacement-plan.md`).

## When this skill fires

| Trigger | Lane | Read |
|--|--|--|
| New feature needs storage | **New** | `design-gate.md` |
| Adding a column, index, table, or store to an existing feature | **New within existing** | `design-gate.md` scoped to the change |
| Existing table or column under review | **Audit** | `audit.md` |
| Access pattern missing an index or fighting the engine | **Audit → optimize-or-replace** | `audit.md`, then decide below |
| A store is being retired or merged | **Replacement** | `replacement-plan.md` |
| A schema question ("one table or two?") | ADR | design-gate answers 1–5 |

Every object touched, whether new or existing, also clears the security
baseline (`security-baseline.md`) and the retention/erasure rules
(`retention-erasure.md`). Both lanes produce one artifact — a Change Ledger.

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
system cannot get there. Then follow `replacement-plan.md`.

## Handoff

Your ledger is the input to `software-engineer` and `migration`, not a
substitute for their work. Deliver:

- The Change Ledger as a list in the spec/architecture doc.
- For new stores/tables/columns: the DDL sketch plus the ten answers from
  `design-gate.md`.
- For changes: the expand-contract phase list (`replacement-plan.md`) and
  the invariant that must hold across each phase.
- A prioritized change list (Remove/Restructure/Consolidate first;
  Migrate/Create last).
- The observability contract per new or changed object (dashboard,
  p99 threshold, alert owner).

`software-engineer` translates rows into spec and architecture.
`migration` owns the safe sequencing (expand-contract, backfill batching,
index concurrency). Do not skip either.

## Don't

- Recommend a drop without completing the Unused Proof checklist
  (`audit.md`).
- Treat "I could not find a caller" as evidence of no caller — prove it
  with database statistics over a full retention window.
- Design a new store without naming the top three read and top three
  write queries with p50/p99 budgets.
- Pick a monotonic ID as the leading partition/sort key on a high-write
  table.
- Add a full index where a partial index would serve the actual query.
- Declare an index in a one-off SQL file the ORM will not track.
- Propose a replacement system without the five-part plan
  (`replacement-plan.md`).
- Cut over reads before a **≥ 2-week** dual-write window with shadow-read
  drift alerts wired.
- Treat soft delete as GDPR/CCPA erasure (`retention-erasure.md`).
- Assign **High** confidence to a call backed by only one signal.
- Alert on averages when the golden signal is a p99.
- Silently widen an audit into a redesign — file the extra findings as
  new ledger rows, do not fold them into an existing one.
- Ship a ledger row without a named downstream owner per impacted
  service, job, report, and integration.
