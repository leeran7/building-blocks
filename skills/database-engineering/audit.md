# Audit — existing tables and columns

For every object, one verdict:

| Verdict | Meaning |
|--|--|
| **Retain** | Keep as-is. Schema, usage, and cost are justified. |
| **Restructure** | Same table, changed shape (type, nullability, index, constraint, partition). |
| **Consolidate** | Merge with another table or column; the other side wins. |
| **Migrate** | Move to a different store (OLTP → OLAP, hot → cold, RDBMS → KV). |
| **Remove** | Drop. Requires **Unused Proof** below. |

## Seven axes

Score every object against all seven. A weak axis is a finding, not a
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
   in columns (see `security-baseline.md`).
7. **Retention** — regulatory window, legal hold, product TTL, cold tier,
   deletion mechanism (see `retention-erasure.md`).

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
