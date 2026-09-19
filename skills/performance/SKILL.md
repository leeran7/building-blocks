---
name: performance
description: >-
  Performance analysis and optimization. Bundle size, query efficiency, runtime
  latency, and algorithmic complexity. Use when reviewing hot paths, optimizing
  builds, or investigating slowdowns.
---

# Performance Skill

Measure first. Baseline before every edit; compare after. Optimization without
measurement is guessing.

## Analysis order

1. **Baseline** the current metric (bundle size, query time, p95 latency,
   render count). Record the number.
2. **Profile** the hot path. Identify the actual bottleneck — don't assume.
3. **Fix** the bottleneck with the smallest change that moves the metric.
4. **Verify** the metric improved and no regressions appeared elsewhere.

## Algorithmic complexity

- Never replace an O(1) closed-form with a per-index scan without a prefix-sum
  or memo in the same change.
- When a cache key goes from low to unbounded cardinality, add eviction in the
  same change.
- A >10x suite-runtime jump is a performance regression. Catch it before merge.
- `.find(x => x.key === k)` on a growing collection needs an index or a Map.

## Bundle and build

- Tree-shake: named imports, no barrel re-exports of entire packages.
- Code-split routes and heavy dependencies behind dynamic `import()`.
- Measure bundle impact of new dependencies before adding them.
- Image and asset optimization: appropriate formats, lazy loading below fold.

## Database and queries

- N+1 queries: batch or join. Never loop a query inside a loop.
- Index every column used in WHERE, ORDER BY, or JOIN on tables that grow.
- Paginate unbounded result sets. Never `SELECT *` without a LIMIT in
  application code.

## Don't

- Optimize without a baseline measurement
- Add caching without eviction strategy
- Premature-optimize code that runs once at startup
- Trade readability for microseconds outside a proven hot path
