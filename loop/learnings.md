# Open Questions

Questions that need a human decision before agents can proceed.
Resolved questions are removed — the answer lives in the target file.

- **[security-reviewer -> future work, filed 2026-09-20, SEC-8] `/tournaments/[id]`
  has the same defect class SEC-4 just fixed on `/tournaments`, one level deeper.**
  `TournamentDetail.tsx` (rendered by `app/app/tournaments/[id]/page.tsx`) shows an
  "Enter tournament — $X" button that POSTs to the real-money Stripe entry-fee
  checkout with no geo awareness at all: no `resolveRankedEligibility`, no
  `force-dynamic`, no `initialGeoAllowed`/`useRankedEligibility` on `TournamentDetail`.
  Not reachable today for three independent reasons: `GET /api/tournaments/[id]`
  unconditionally 503s so `tournament` stays null and the button never mounts; the
  button is also gated on `isOpen`; and `POST /api/tournaments/[id]/checkout`
  already carries `assertPaidDuelAllowed` server-side, so no money could move even
  if reached. The page is also not statically prerendered, so no build-time HTML
  bakes in a paid CTA for a blocked region. Whoever removes the `comingSoon()`
  early returns to launch tournaments must, in the same change as SEC-4's original
  checklist item: make `app/app/tournaments/[id]/page.tsx` async, call
  `resolveRankedEligibility(await headers())`, add `export const dynamic =
  "force-dynamic"`, and give `TournamentDetail` a required `initialGeoAllowed:
  boolean` prop gating the `isOpen`/Enter-button block the same way `TournamentList`
  now gates its tier picker. Not blocking today; remove this entry once tournaments
  launch work picks it up.

- **[software-engineer -> future work, filed 2026-09-20] `/settings` has the same
  back/forward staleness gap the /dashboard fix just closed.** Both pages use the
  "server-resolves payload via cookie, seeds client state from `initialData`"
  pattern (`settings/page.tsx` + `SettingsForm.tsx`, `dashboard/page.tsx` +
  `DashboardBody.tsx`). Confirmed via live browser testing (Playwright, Next
  16.3.4's `HistoryTraversal` navigation path) that Next's back/forward
  navigation bypasses `staleTimes.dynamic` entirely and restores a cached RSC
  segment with zero fresh request — so a page that permanently suppresses its
  client fetch once `initialData !== null` (as `SettingsForm` still does) never
  self-heals after a Back navigation. `/dashboard` was fixed by making the
  client fetch an unconditional, silent, post-paint background revalidation
  (seed still gives zero-flash first paint; failures never clobber painted
  content — see `DashboardBody.tsx`'s `errorUnlessAlreadyLoaded` helper for the
  pattern to copy). `/settings` was left untouched (out of scope for the
  dashboard task) — its exposure is lower since a user's own settings rarely
  change from another tab/flow mid-session, but it's the same defect class.
  If `SettingsForm` ever needs to reflect a change made elsewhere (e.g. a
  future flow that edits settings server-side and the user navigates back),
  apply the same fix. Not blocking today; remove this entry once addressed.

- **[reviewer -> future work, filed 2026-09-20] `/dashboard`'s always-revalidate
  fix doubles DB query cost per cold view (7→14 Prisma queries), including the
  unbounded `climbRecord` COUNT running twice.** Necessary trade-off to fix a
  proven HIGH staleness bug (see the removed `/dashboard` back/forward entry
  above) — not blocking, but unmeasured until this was traced. Cheapest fix on
  record: wrap the category-global total-climbers COUNT in
  `unstable_cache(..., { revalidate: 60, tags: [LEADERBOARD_CACHE_TAG] })`
  mirroring `app/src/db/climb.ts:151` (note `getGlobalClimbStats` at
  `climb.ts:186-197` already computes the same COUNT — could share one cached
  read). Alternative: stamp `DashboardData` with a server `resolvedAt` and skip
  the mount revalidation when the seed is <~5s old. Remove once addressed or
  explicitly deprioritized.

- **[reviewer -> future work, filed 2026-09-20] `app/src/db/dashboard.ts`
  inverts the dependency direction — the db layer imports types from
  `"use client"` component modules under `src/components/Dashboard/`.**
  Type-only and erased at build time (no `server-only` guard or eslint
  boundary rule exists in this repo to catch a future non-type import doing
  the same). Fix: type `DashboardData` from the db layer's own equivalents
  (`ClimbReplaySummary` in `climb.ts`, `RecentDuelItem` in `duel.ts`) instead
  of reaching into components — they already accept these shapes
  structurally. Optionally add `import "server-only";` to
  `app/src/db/client.ts` to make the boundary enforced rather than
  conventional. Not blocking; remove once addressed.

- **[security-reviewer -> software-engineer] Is the free leaderboard a
  trust boundary?** `climb/result/route.ts` self-reports `peakY` which is
  acceptable "because it never pays out", but the ranked re-simulation path
  does not exist. Paid Stacks removed 2026-09-10; question still open for
  the free leaderboard itself.

- **[reviewer, verifier -> software-engineer] One slot or stacking for power-ups?**
  `powerups.ts:18-19` documents one slot; production stacks all five types
  and `powerups.test.ts:236` asserts stacking is correct. The endless-run
  balance argument and the duplicate-entry bug fix depend on the answer.

- **[reviewer, security-reviewer -> human, filed 2026-09-23] No sim/generator
  version on duels or replays.** The hills/ramp-hardening change (4/6-level
  hills, slope cap, slab-drag fix) alters `obstaclesForFloor`/motion, so
  duels started before the deploy re-simulate against the new layout, and
  old `/play?r=` replays desync. Decide: drain or void pending duels across
  the deploy, and/or stamp a sim version on `Duel`/`climb_runs` that
  `simulateDuel` and the replay decoder reject or branch on. Related,
  pre-existing: a CHEAT_FLAGGED resim after both replays are submitted
  leaves a paid duel active with its stake locked (`duel/[id]/result`
  route + `reapDuelIfStale`). Remove once decided.

- **[reviewer, verifier -> software-engineer, filed 2026-09-23] Follow-ups
  from the hills change, out of its scope.** (1) `standsOnSlab` in
  `obstacles.ts` duplicates `simulation.ts` `isSupported`. Move one
  implementation to `towers.ts`, which is cycle-free. (2) `maxRampSlope`
  assumes `SPRINT_BURST_MULT` is the max ground-speed multiplier. Export a
  `MAX_GROUND_SPEED_MULT` from `powerups.ts`, pinned by a test. Remove each
  item once done.
