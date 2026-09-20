# QA Acceptance Report — /dashboard skeleton-flash fix

**Date:** 2026-09-20
**Scope:** `app/app/dashboard/page.tsx`, `app/app/dashboard/DashboardBody.tsx` (new),
`app/app/dashboard/layout.tsx` (deleted), `app/tests/components/dashboardBody.test.tsx` (new)

**Note on spec mismatch:** `loop/spec.md` (`paths.spec`) currently contains the
spec for an unrelated feature ("1v1 Quick Play on Mobile"), not this dashboard
change. There is no Flows/AC section in the repo spec file for this change, so
the structural spec gate (Do #6) does not apply here — the acceptance criteria
for this cycle were supplied directly in the task brief (AC-1..AC-5) by the
orchestrator, mirroring how the four upstream agents scoped their own
handoffs. Flagging this as a process gap for whoever updates `loop/spec.md`
next, but not treating it as a blocking structural failure since explicit ACs
were provided out-of-band.

## Method

- Read all four upstream handoffs (software-engineer, verifier, reviewer,
  security-reviewer) in full.
- Re-read the final diff directly (`page.tsx`, `DashboardBody.tsx`,
  `settings/page.tsx` precedent).
- Ran `pnpm build` (clean, `rm -rf .next` first) and inspected the route table
  and `.next/prerender-manifest.json` directly (AC-2).
- Ran the existing `dashboardBody.test.tsx` in isolation, then the full gate
  suite (lint / typecheck / test) myself, from a clean rebuild (AC-1, AC-5).
- Started the production build (`pnpm start`) and made my own live HTTP
  request with a forged, structurally-valid-but-bad-signature JWT cookie,
  independent of security-reviewer's own probe (AC-4).
- Built a throwaway, isolated reproduction of Next.js's client router
  back/forward behavior against two dynamic (`ƒ`) probe routes in a real
  Chromium browser (via Playwright) running against this exact app's
  production build, to resolve the reviewer's staleness warning empirically —
  then deleted the probe routes/script and confirmed a clean working tree
  before finishing.
- Read Next.js 16.3.4's own shipped source
  (`node_modules/next/dist/client/components/segment-cache/bfcache.js`,
  `.../router-reducer/ppr-navigations.js`, `.../app-router-instance.js`,
  `.../bfcache-state-manager.js`, `.../server/config-shared.js`) to confirm
  the mechanism behind the observed browser behavior.

## AC-by-AC results

### AC-1 — Real content on first render, no skeleton flash — PASS

Evidence: `app/app/dashboard/page.tsx` is an async server component that reads
the `firebaseToken` cookie via `next/headers` `cookies()`, verifies it with the
shared `verifyIdToken`, and runs the same five DB reads `GET /api/dashboard`
performs (byte-identical fallback semantics), then hands the result to
`DashboardBody` as `initialData`. `DashboardBody`'s `fetchState` seeds directly
to `{status:'success', data: initialData}` when non-null, and the
loading-spinner / `if (!user) return null` guards are nested under
`initialData === null`, so real content paints on the first frame even while
`useAuth()` is still `loading` and `token` is `null`.

Independently re-ran `app/tests/components/dashboardBody.test.tsx` (added by
verifier) in isolation: 3/3 pass, including the specific assertion that real
`DuelRecordCard` content renders with `authLoading=true` and no `SkeletonCard`
in the markup. Verifier already proved this is a real (non-placebo) gate by
reverting the seed logic and watching it fail red, then restoring — I did not
need to re-do that proof, but confirmed the test still passes against the
current tree.

### AC-2 — `/dashboard` absent from `.next/prerender-manifest.json` — PASS

Did a full clean rebuild (`rm -rf .next && pnpm build`) myself, independent of
the two upstream worktree builds. Route table shows `ƒ /dashboard`. Confirmed
directly via:

```
node -e "const m=require('./.next/prerender-manifest.json'); console.log(Object.keys(m.routes).includes('/dashboard'))"
→ false
```

### AC-3 — No-cookie / expired / tampered cookie still works via client fallback — PASS

`curl http://localhost:3901/dashboard` with no cookie → `307` (unchanged
presence-only middleware/proxy redirect to signin, same as before this
change — `context/trust.md` item 5 confirms middleware was never the access
control layer). With a forged cookie (see AC-4), the page still returns `200`
with a fully-formed HTML shell and `initialData:null`; `DashboardBody` renders
its existing loading/redirect chrome and the client `fetchDashboard()` effect
fires (guarded on `initialData !== null` only suppressing the fallback fetch
when the server *did* pre-populate). No crash, no blank/broken page — same UX
as pre-change, just routed through the fallback path. This matches all three
upstream agents' independent tracing of the try/catch (empty catch, all sync
failure paths leave `initialData = null`, nothing throws past the catch).

### AC-4 — No cross-user leak; response never shared-cacheable — PASS

Primary evidence: security-reviewer's forged-RS256-JWT test against a live
`next start` build — correct `iss`/`aud`/`exp`, attacker-chosen `sub`/`email`,
garbage signature — returned `200` with `initialData:null` and zero
occurrences of the forged uid/email in the HTML or RSC flight payload, and
`Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`.

My own independent spot-check (own forged JWT, own build, own server
instance on a different port): same result —

```
HTTP/1.1 200 OK
Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
...
grep -c "victim-uid-qa-999\|victim-qa@example.com" response.html → 0
initialData\":null
```

All five DB reads are uid-keyed off `decoded.uid` (the just-verified token's
own subject), none uses `unstable_cache`/React `cache()`, and the
`Promise.all` + typed-object-assignment structure means a partial failure
never produces a half-populated `initialData` (confirmed by re-reading
`page.tsx:37-70` directly).

### AC-5 — Protected files untouched — PASS

```
git diff --stat HEAD -- app/app/api/dashboard/route.ts app/src/lib/requireAuth.ts \
  app/src/lib/firebaseAdmin.ts app/src/lib/authCookie.ts
→ (empty output)
```

Re-confirmed myself (third independent confirmation after software-engineer
and reviewer/security-reviewer's own checks).

## The open staleness question — RESOLVED: reviewer's concern is REAL and REACHABLE

**Conclusion: this diff introduces a genuine back/forward staleness
regression that did not exist before the change, on this exact Next.js
version (16.3.4) and this exact `next.config.js` (no `staleTimes` override,
`experimental: {}`).** This is an acceptance failure per the task's stated
decision rule.

### Evidence — real browser reproduction (primary)

Built two minimal, throwaway dynamic (`ƒ`) routes with no auth dependency,
each server-rendering `Date.now()` and linking to each other via
`next/link` (so navigation goes through Next's client router, not a full
page load):

```
/bfcacheprobea  → ƒ, renders Date.now()
/bfcacheprobeb  → ƒ, renders Date.now()
```

Ran `pnpm build && pnpm start` (this repo's actual production build/config),
then drove a real Chromium instance via Playwright:

1. Navigate to `/bfcacheprobea` → `tsA1 = 1789913649376`
2. Click the `next/link` to `/bfcacheprobeb` → `tsB1 = 1789913649630`
   (different timestamp — confirms this is a fresh dynamic render, and that
   client-side navigation is actually occurring, not a full reload)
3. Wait 1500ms (well past `staleTimes.dynamic = 0`)
4. `page.goBack()` (browser Back button → `popstate`) → back on
   `/bfcacheprobea`, `tsA2 = 1789913649376`

**`tsA2 === tsA1`: identical.** No fresh server request was made on
back-navigation, despite 1.5+ seconds elapsing and this being a fully dynamic
(`ƒ`) route with no `staleTimes` override. The probe routes and script were
deleted immediately after and the working tree confirmed clean
(`git status --short` shows only the four files under review).

### Evidence — Next.js 16.3.4 source (why)

- `node_modules/next/dist/server/config-shared.js`: default
  `staleTimes: { dynamic: 0, static: 300 }` — confirms this repo runs on the
  documented default, no override anywhere (`next.config.js` has
  `experimental: {}`).
- `node_modules/next/dist/client/components/app-router-instance.js`:
  `dispatchTraverseAction` (fired from the `popstate` listener) always
  dispatches `ACTION_RESTORE`.
- `node_modules/next/dist/client/components/router-reducer/router-reducer.js`:
  `ACTION_RESTORE` unconditionally routes to `restoreReducer` — no
  PPR/`cacheComponents`/experimental-flag gate on this dispatch.
- `node_modules/next/dist/client/components/router-reducer/reducers/restore-reducer.js`
  calls `startPPRNavigation(..., FreshnessPolicy.HistoryTraversal, ...)`.
- `node_modules/next/dist/client/components/router-reducer/ppr-navigations.js`,
  `createCacheNodeForSegment`, `case 2` (== `FreshnessPolicy.HistoryTraversal`):
  calls `readFromBFCache(tree.varyPath)` and, if an entry exists, returns
  `needsDynamicRequest: false` — i.e. no network request is spawned; the
  previously-cached CacheNode (RSC payload) is reused as-is.
- `node_modules/next/dist/client/components/segment-cache/bfcache.js`,
  `readFromBFCache`: passes `-1` instead of the current time to
  `getFromCacheMap`, with the inline comment *"During a back/forward
  navigation, it doesn't matter how stale the data might be. Pass -1 instead
  of the actual current time to bypass staleness checks."* And on the write
  side: *"A back/forward navigation will disregard the stale time. This field
  is only relevant when staleTimes.dynamic is enabled or
  unstable_dynamicStaleTime is exported by a page."*
- By contrast, `case 0` (`FreshnessPolicy.Default`, used by
  `navigate-reducer.js` for `router.push`/`Link` clicks) calls
  `readFromBFCacheDuringRegularNavigation(now, ...)`, which *does* pass the
  real `now` and *does* respect `staleTimes.dynamic`. This is the path the
  prior cycle's `staleTimes.dynamic = 0` conclusion was actually about — and
  that conclusion is correct **for that path**. It does not generalize to
  back/forward, which is a structurally different reducer/freshness-policy
  branch, confirmed by the Next.js team's own comments in the source.
- Checked whether the newer Activity-style full-component-state preservation
  (`bfcache-state-manager.js`, `useRouterBFCache`) would instead mask this by
  preserving the live React instance (which would make the question moot in a
  different way): `MAX_BF_CACHE_ENTRIES = process.env.__NEXT_CACHE_COMPONENTS
  ? 3 : 1`, and this repo's `next.config.js` does not enable
  `cacheComponents` — so that mechanism only ever tracks the single
  currently-active tree, meaning `DashboardBody` genuinely unmounts on
  navigation away and genuinely remounts on back-navigation. It is fed by the
  stale segment-level BFCache entry described above, not by a preserved live
  instance. This also confirms why the **old** pre-fix code (a bare `"use
  client"` page with a mount-effect `fetchDashboard()` and no
  `initialData`) self-healed on back-navigation: its RSC segment carried no
  server-computed data to go stale — only a reference to the client
  component — and the client component's own mount effect re-ran on every
  genuine remount, independent of the RSC segment cache.

### Applying this to the concrete repro from the task

User views `/dashboard` (server-populated `initialData` with pre-duel stats,
cached into the segment BFCache on that render) → navigates to `/duel` via
the router → wins a match (server-side DB write via the duel API, entirely
outside the router) → presses Back. `dispatchTraverseAction` restores
`/dashboard`'s cached CacheNode with `needsDynamicRequest: false` — the same
pre-duel `initialData` prop is handed to a freshly-mounted `DashboardBody`.
`fetchState` seeds to `{status:'success', data: staleData}`; the client fetch
effect's `if (authLoading || initialData !== null) return;` guard permanently
suppresses any correction. The stale win/loss record stays on screen with no
mechanism to refresh it short of a manual reload — exactly reviewer's
predicted defect, now confirmed reachable both by live browser reproduction
and by direct reading of the Next.js 16.3.4 source that ships in this repo's
`node_modules`.

This is the user's own data (no cross-user exposure — consistent with
security-reviewer's AC-4 findings), so it is not a trust-boundary or security
defect. But it is a real, reachable behavioral regression against this
change's own stated goal ("preserve all existing behavior"), on the single
most obvious flow a dashboard would be revisited through (finish a duel,
check your updated record).

## Other findings carried forward (non-blocking on their own, bundle into the same revision pass)

Per the task's decision rule, since software-engineer will already be back in
these files for the staleness fix, also address reviewer's two other
non-blocking warnings in the same pass:

1. **Type-drift risk between payload producers**
   (`app/app/dashboard/page.tsx:37-66` vs
   `app/app/api/dashboard/route.ts:41-76`) — two producers of
   `DashboardData`, only one type-checked. Extract a shared
   `buildDashboardPayload(uid): Promise<DashboardData>` and call it from both.
2. **BetaBanner layout shift** (`DashboardBody.tsx:191`) — `token &&
   <BetaBanner token={token} />` mounts a few hundred ms after first paint on
   the server-populated path, since `betaJoined` (already known server-side)
   isn't used to drive its visibility/space directly.

Both were independently re-confirmed present in the current diff by reading
the same line ranges reviewer cited; not re-litigating them here beyond
carrying them forward as required fixes in the same revision.

## Overall (iteration 1 conclusion)

4 of 5 explicit ACs pass cleanly with independent spot-check evidence
(AC-1, AC-2, AC-3, AC-4, AC-5 all PASS on their own terms). The blocking issue
is the staleness gap identified by reviewer's finding #3, now resolved from
"open question" to "confirmed real and reachable" via a live browser
reproduction plus Next.js 16.3.4 source reading. Per the task's explicit
decision rule, this is an acceptance failure requiring a loop-back to
software-engineer, not a pass with an accepted non-blocking warning.

---

## Iteration 2 — re-acceptance after software-engineer's revision

**Scope added since iteration 1:** the HIGH staleness fix (unconditional
background revalidation + `errorUnlessAlreadyLoaded`), the `buildDashboardPayload`
extraction to `app/src/db/dashboard.ts`, and the `BetaBanner` server-known-
`betaJoined` fix. verifier, reviewer, and security-reviewer all independently
signed off with no critical findings (see their iteration-2 handoffs,
`verifier-2026-09-20T144543Z.json`, `reviewer-2026-09-20T150500Z.json`,
`security-reviewer-2026-09-20T150200Z.json`).

### My own final confirmation of the original HIGH finding — CLOSED

Rather than trust the three upstream agents' mutation tests alone, I redid a
live-browser back-navigation reproduction using the **same method as
iteration 1** (throwaway dynamic probe routes, real Chromium via Playwright,
`pnpm build && pnpm start`, real client-side `next/link` navigation, browser
Back past `staleTimes.dynamic=0`), but went one step further than every prior
probe in this loop (including my own iteration-1 one and software-engineer's
iteration-2 A/B probe): I mounted the **real, unmodified `DashboardBody`
component** — not a reimplementation — inside the probe route, exercising its
actual effects, actual `errorUnlessAlreadyLoaded`, and actual fetch call, in a
real browser, through a real back-navigation that restores a real stale RSC
segment. This was reviewer's own named "one remaining uncovered combination"
(`reviewer-2026-09-20T150500Z.json` feedback[0]: "the useful extra experiment
is NOT a third run of the same probe but a different one: a probe route that
mounts the REAL DashboardBody with a stub payload").

**Method:**
- No live Firebase project is configured in this sandbox (`FIREBASE_PROJECT_ID`
  etc. are unset — confirmed by reading `src/lib/firebaseAdmin.ts`), so a truly
  real signed-in session is not achievable here, matching why every prior agent
  in this loop (including me in iteration 1) also worked around real auth
  rather than using it.
- Created two throwaway probe routes (`app/qaprobea`, `app/qaprobeb`, deleted
  before this handoff) using `cookies()` to stay dynamic (`ƒ`), matching
  `/dashboard`'s own rendering mode.
- `qaprobea` renders the **real, unedited `DashboardBody`** import with a
  server-seeded `initialData` (a `Date.now()`-derived `duelStats.wins` value,
  so every server render is visibly distinct) and a real `next/link` to
  `qaprobeb` (a plain `<a>` tag was tried first and silently produced a full
  hard navigation instead of exercising Next's client router on Back — caught
  and fixed before trusting any result; documented in learnings below).
- The only production-code touch was swapping `DashboardBody`'s one
  `useAuth` import line to a throwaway stub context (`__qaProbeAuthContext.tsx`,
  deleted) returning a fixed, memoized `{user, token, loading:false}` — the
  minimum needed to make the auth gate pass without a real Firebase session.
  This is the only line of the real component that differed from production
  during the probe; every other line — the revalidation effect,
  `errorUnlessAlreadyLoaded`, the JSX, the fetch call — ran unmodified.
- Playwright intercepted `**/api/dashboard` (and the incidental
  `/api/notifications/count`, `/api/settings`, `/api/wallet` calls from
  `Navbar`/`WalletCard`, also real components DashboardBody mounts) at the
  network layer only, returning a distinct fresh payload (`wins: 424242`)
  after a 600ms delay so the in-flight frame is observable.
- Flow: visit `qaprobea` (server-seeded stale record painted, e.g. `17285–2`)
  → real `next/link` client-side nav to `qaprobeb` → wait 1500ms (>>
  `staleTimes.dynamic=0`) → `page.goBack()`.

**Result (current code, fix in place):**
- Immediately after Back, the DOM showed the **original stale seeded value**
  (`17285–2`, byte-identical to the first visit, not a new `Date.now()`-derived
  value) — proof the RSC segment really was restored from cache with no fresh
  server request, precisely the iteration-1 precondition, still true on this
  exact code.
- **Zero skeleton cards** present in that frame — no loading flash.
- Within the observable window, the real `DuelRecordCard` DOM updated to the
  fresh intercepted value (`424242–2`) — the real component's real background
  revalidation effect fired for real and corrected the real DOM.
- Exactly one `/api/dashboard` call happened strictly after Back (confirms the
  self-heal is the real effect firing once, not restated luck).
- All 4/4 assertions passed.

**Negative control (methodology validation):** temporarily reintroduced
iteration-1's `if (initialData !== null) return;` guard into the real
`DashboardBody.tsx`, rebuilt, reran the identical probe. Result: the restored
frame showed the stale value, and it **never healed** — `page.waitForFunction`
timed out waiting for the fresh value, exactly reproducing the original HIGH
defect on the real component in a real browser. This proves the probe isn't a
false positive: it correctly fails when the actual defect is present and
correctly passes when the actual fix is present. Reverted the guard
byte-identical to what verifier/reviewer read (confirmed by grep for the
guard string returning no matches), rebuilt clean, reran the fixed-code probe
one more time as a final check — 4/4 pass again.

**Conclusion: the specific defect scenario I found in iteration 1 is
genuinely closed.** This is a true before/after comparison on the real
component, not an inference from a reimplementation or a DOM-only mount —
closing the one gap reviewer itself named as unresolved, without needing to
relitigate reviewer's (correct) reasoning that a third repeat of the *same*
probe would have added nothing.

All probe files deleted after use (`app/qaprobea/`, `app/qaprobeb/`,
`src/contexts/__qaProbeAuthContext.tsx`, driver scripts); `next-env.d.ts` and
build-generated `AGENTS.md`/`CLAUDE.md` reverted/removed; `git status --short`
confirmed to match exactly the tree left by software-engineer/verifier/
reviewer/security-reviewer before writing this handoff.

### AC-1..AC-5 re-validation (iteration 2) — all PASS

- **AC-1** (real content on first paint, no skeleton flash): unaffected by the
  revision (confirmed by reading the unchanged seed/loading-guard logic in
  `DashboardBody.tsx`); full gate suite re-run by me from a clean tree
  (lint clean, typecheck clean, 82 files / 751 tests pass).
- **AC-2** (`/dashboard` dynamic, absent from prerender manifest): own clean
  `rm -rf .next && pnpm build` — `ƒ /dashboard` in the route table; own node
  script confirms `/dashboard` absent from `.next/prerender-manifest.json`.
- **AC-3** (no/expired cookie still works via fallback): own `curl` with no
  cookie against a live `pnpm start` instance → `307` (unchanged).
- **AC-4** (no cross-user leak): own freshly forged, structurally-valid,
  bad-signature RS256 JWT (`sub`/`email` = `victim-uid-qa-final` /
  `victim-qa-final@example.com`) against my own live instance —
  `GET /dashboard` with the forged cookie → `200`, `initialData":null`, 0
  occurrences of the forged identity anywhere in the HTML,
  `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`;
  `GET /api/dashboard` with the same token as Bearer → `401
  {"error":"Invalid or expired token","code":"UNAUTHORIZED"}`. Third
  independent forged-JWT confirmation in this loop (after my own iteration-1
  probe and security-reviewer's iteration-2 probe), all three agreeing.
- **AC-5** (protected files untouched, including the new extraction): own
  `git diff --stat HEAD` over the four protected files — only
  `app/app/api/dashboard/route.ts` has a diff (9 insertions / 29 deletions);
  `requireAuth.ts`, `firebaseAdmin.ts`, `authCookie.ts` show zero diff. Read
  the actual `route.ts` diff hunk by hunk myself (not just the import lines):
  the `requireAuth`/`AuthError` auth block, the `runtime = "nodejs"` export,
  the structured success log (`uid`, `duration_ms`, `timestamp` all still
  present), the 500 error envelope and `console.error` are all byte-unchanged;
  the only changes are the import swap and replacing the inline `Promise.all`
  block with the `buildDashboardPayload` call plus an updated JSDoc comment.

### Non-blocking warnings — acknowledged, not re-litigated

Reviewer's two non-blocking warnings (always-revalidate doubles DB query cost
7→14 per cold dashboard view, with a fix on record for `unstable_cache`; and
`src/db/dashboard.ts` inverting dependency direction by importing from
`src/components/`, type-only/erased, fix on record) are accepted trade-offs
per the task brief — not re-verified independently here, since both are type-
level/architectural observations already traced precisely by reviewer with
code citations, and neither affects any AC's pass/fail status.

### Staging hazard — flagged for integrator

Confirmed via my own `git status --short`: `app/app/dashboard/DashboardBody.tsx`,
`app/src/db/dashboard.ts`, `app/tests/components/dashboardBody.test.tsx`, and
`app/tests/components/dashboardBodyRevalidate.test.tsx` are untracked (`??`),
while `app/app/dashboard/layout.tsx`'s deletion is unstaged. A `git commit -a`
would capture the deletion and the `page.tsx`/`route.ts` edits but silently
drop all four new files, producing a commit that cannot build (`page.tsx` and
`route.ts` both import `src/db/dashboard`). Integrator must stage explicitly:
`git add app/app/dashboard/DashboardBody.tsx app/src/db/dashboard.ts
app/tests/components/dashboardBody.test.tsx
app/tests/components/dashboardBodyRevalidate.test.tsx` plus
`git rm app/app/dashboard/layout.tsx`, then confirm `git status --short` shows
no remaining `??` under `app/` before committing. Branch is
`claude/amazing-pascal-xjxhdl`; per `context/git.md`, open a PR against `main`.

### Overall (iteration 2)

All 5 ACs PASS. The original HIGH finding is confirmed closed via a live
before/after browser reproduction on the real component (not just mutation
tests on isolated pieces), with a negative control proving the reproduction
method itself is valid. No new blocking findings. Proceeding to integrator.
