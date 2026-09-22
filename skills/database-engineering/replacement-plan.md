# Replacement Plan (five parts, all required)

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

## Expand-contract, in one paragraph

Every shape change goes through it: **expand** (add new alongside old,
backward-compatible), **migrate** (dual-write and/or backfill in batches),
**contract** (drop the old once no code reads it). The `migration` skill
owns the sequencing; the ledger row states which invariant survives each
phase.
