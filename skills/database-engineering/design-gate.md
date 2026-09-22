# Design Gate — new stores, tables, columns, indexes

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
   - **Partial index** for a hot subset (`WHERE status = 'pending'`) —
     cheaper to update, faster to scan.
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
   `retention-erasure.md`), regulatory window, legal-hold path.
8. **Security baseline.** PII/PHI/PCI classification per column,
   encryption at rest + in transit, row-level security where a row is
   scoped to a tenant/user, least-privilege service account per consumer,
   no secrets in columns (see `security-baseline.md`).
9. **Capacity envelope.** Row count and byte size at 1×, 10×, 100×. Say
   what breaks first at each step (index size, vacuum time, replication
   lag, backup window).
10. **Observability contract.** The four golden signals — latency,
    traffic, errors, saturation — plus per-statement p99 for the queries
    from step 1. Name the dashboard, the alert threshold, and who owns the
    page. Percentiles, never averages: an average hides the p99 that
    breaks a small but real percentage of users.
