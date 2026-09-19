---
name: regression
description: >-
  Regression detection across behavior, contracts, performance, and state.
  Systematic before/after comparison to catch breakage a test suite alone
  misses. Use when reviewing changes, after refactors, or before merge.
---

# Regression Skill

A test suite proves what it covers. Regressions hide in what it doesn't.
This skill is the checklist for the gaps between test assertions.

## When to apply

Every change that touches more than a single leaf file, and any change to:
shared utilities, public APIs, data models, auth/trust paths, build config,
or dependency versions. Single-file typo fixes do not need this.

## 1 — Behavioral regression

Compare before/after behavior, not just type-correctness.

| Check | How |
|-------|-----|
| Every modified export | Grep all call sites. If a signature, return type, or default changed, each caller must still work — `tsc` does not catch runtime shape mismatches in `fetch().json()` casts or dynamic imports. |
| Removed or renamed exports | Grep the old name across the repo. A caller importing a now-deleted symbol compiles if it re-exports from a barrel that swallows the error. |
| Changed defaults or fallbacks | List every consumer that relied on the old default. An allow-list parser returning `null` instead of a fallback is correct; silently returning a new value is a regression. |
| Conditional branch changes | If a branch was added, removed, or reordered, find inputs that previously took the old path and verify they still produce correct output. |
| Error path changes | A caught exception that now throws (or vice versa) changes behavior for every caller. Trace the full throw/catch chain. |

## 2 — Contract regression

Contracts live at system boundaries. Breaking one is invisible to unit tests.

| Surface | What breaks silently |
|---------|---------------------|
| API routes | Response shape change (added/removed field, renamed key, changed type). Grep the client fetch and verify the consumer reads the new shape. |
| Database schema | Column rename, nullability change, dropped index, new NOT NULL without default. Run `db push` or migration and confirm existing rows survive. |
| Event / webhook payloads | Changed field names or envelope shape. Grep every handler/subscriber. |
| Environment variables | Renamed, removed, or new required var. Grep deployment config and CI. |
| File/URL path changes | Moved route, renamed file that other code references by string path. |
| Inter-package contracts | In a monorepo, a change in package A's export that package B consumes. The lockfile and build cache may hide the break until a clean install. |

## 3 — Performance regression

Measure; don't reason.

| Check | Threshold |
|-------|-----------|
| Test suite runtime | >10× jump vs baseline is a regression. Add a memo or prefix-sum if replacing O(1) with O(n). |
| Bundle size | New dependency or barrel import that pulls the full package. Measure with `--analyze` or equivalent. |
| Query count | A refactor that moves a query inside a loop (N+1). Count queries before and after. |
| Cache cardinality | A cache key that went from bounded (enum, small set) to unbounded (user ID, timestamp) needs eviction in the same change. |
| Render count (React) | A state change that triggers a parent re-render. Verify `React.memo` / `useMemo` boundaries still hold. |

## 4 — State and data regression

Existing data must survive the change.

| Check | How |
|-------|-----|
| Migration on existing rows | New NOT NULL column needs a default or backfill. A migration that works on empty dev DB but fails on prod data is a regression. |
| Enum/union narrowing | Removing a variant from a union. Existing records may carry the old value — the read path must handle it or a migration must convert. |
| Serialized state | If the shape of localStorage, cookies, or serialized blobs changed, existing users hit a parse error on load. Add a version check or migration. |
| Cache invalidation | If the cache key format changed, stale entries with the old key format never expire. Flush or version the key prefix. |

## 5 — Build and CI regression

| Check | How |
|-------|-----|
| CI gate rename | Renaming a job `name:` in a workflow silently drops a required-check rule. Verify the ruleset still matches. |
| Dependency lockfile | Adding a dep in one package manager must not rewrite the other tree's lockfile. |
| Build output mode | Verify Next.js rendering mode from the `next build` route table after any page/layout change. A server component awaiting data with no `dynamic` export freezes stale data forever. |
| Dev/prod divergence | `process.env.NODE_ENV` branches, dev-only middleware, or mock-only code paths that ship to production. |

## 6 — Visual and UX regression

| Check | How |
|-------|-----|
| Component states | Every changed component still renders: default, loading, empty, error, overflow, and disabled states. |
| Responsive breakpoints | Test at 320px, 768px, and 1280px. A layout change that works at desktop may overflow or collapse on mobile. |
| Accessibility | Tab order, focus management, aria labels, and color contrast must survive the change. A removed `aria-label` or broken `tabIndex` is a regression. |
| Animation/transition | A CSS change may break an existing transition. Verify enter/exit/hover states if the component has motion. |

## Method

1. **Diff inventory.** List every file changed and every export modified.
2. **Caller sweep.** For each modified export, grep all importers/consumers.
3. **Before/after comparison.** For each caller, verify the behavior is
   unchanged or intentionally updated.
4. **Cross-boundary check.** Walk sections 2–6 above for every boundary the
   diff touches.
5. **Report.** List each regression found with: file, line, what broke, and
   what the fix is. No "might break" — confirm or rule out.

## Don't

- Assume type-safety means behavioral safety — `tsc` cannot see runtime casts
- Skip callers in other packages because "they have their own tests"
- Report a regression without confirming the old behavior actually existed
- Conflate an intentional breaking change with a regression — flag it, but the
  fix is a migration note, not a revert
- Treat a passing test suite as proof of no regressions — this skill exists
  because test suites have blind spots
