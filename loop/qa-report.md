# QA Acceptance Report — SEC-4 close-out (/tournaments region gating)

**Date:** 2026-09-20
**Scope:** Extend server-resolved paid-feature region gating from `/duel` and
`/duel/chips` to `/tournaments` — page (`app/app/tournaments/page.tsx`),
component (`app/src/components/Tournament/TournamentList.tsx`), and the
`/api/tournaments/queue` POST guard.

## Note on `paths.spec` (`loop/spec.md`)

`loop/spec.md` currently documents an unrelated feature ("1v1 Quick Play on
Mobile" / mobile Capacitor Quick Play card), not this SEC-4 close-out. There
is no Flows/AC section in the repo's spec file for the tournaments
region-gating work. This is consistent with how the prior four agents
(software-engineer, verifier, reviewer, security-reviewer) scoped this cycle —
against the security-reviewer's SEC-4 finding and the already-reviewed
`/duel`/`/duel/chips` pattern, not against `loop/spec.md`. I am validating
against the AC-1..AC-5 given directly in this stage's task (mirroring the
established practice from the prior `/duel`/`/duel/chips` cycle), and flagging
the spec/reality mismatch as a process note rather than a blocking structural
gate failure, since: (a) no new user-facing flow was introduced — the existing
join-queue UX is unchanged, only a region gate was added; (b) this is a
narrow, well-specified security hardening task, not a new feature requiring
Flows definition; (c) three independent prior agents already treated this
scope as authoritative without objection. Recommend the orchestrator eventually
reconcile `loop/spec.md` so it doesn't silently drift from what stages are
actually shipping — see learnings.

## Method summary

Live/build evidence (this run, independent of prior handoffs):
- Fresh `pnpm build` in `app/` (own run, not reused from prior agents).
- Read `.next/prerender-manifest.json` directly with a JSON parser.
- Started `pnpm start` locally, curled `/tournaments` anonymously, inspected
  raw HTML and response headers.
- Independently re-ran `pnpm typecheck`, `pnpm lint`, `pnpm test` (745/745
  passing) after reverting build-caused `app/next-env.d.ts` churn.
- `git diff HEAD` on the shared geo core and sibling routes.

Code-inspection evidence (authenticated-blocked / authenticated-allowed
cases — no live authenticated session available in this environment, per the
task's documented caveat and the established practice from the prior cycle's
qa-acceptance on `ChipDuelLobby`):
- Full read of `TournamentList.tsx`'s render ternary and `useRankedEligibility`.
- Structural side-by-side read of the queue route guard vs. `checkout`/`register`.

## AC-1: Blocked region never sees tier picker / Join queue at any point (incl. first frame); allowed region sees it correctly

**Result: PASS (code inspection; live-verified for the SignInGate/anonymous
sub-case only — see caveat 1 below, which is expected, not a gap)**

- `TournamentList.tsx:127-141` is a single top-level ternary:
  `!user ? <SignInGate/> : !geoAllowed ? <region-block/> : <tier-picker + Join queue>`.
  There is no other return path, branch, or effect that renders the tier
  picker or Join queue button outside this final `else`.
- `geoAllowed` comes from `useRankedEligibility(true, initialGeoAllowed)`
  (`useRankedEligibility.ts:31`): `useState<boolean>(serverAllowed)` —
  the value is seeded synchronously from the server-resolved prop, so the
  **first client render already reflects the server decision**. There is no
  `null`/optimistic-`true` window before hydration; a client-side re-probe
  (`/api/geo/ranked`) can only ever replace the server value with another
  server-derived value (comment at `useRankedEligibility.ts:18-22`,
  confirmed by reading the effect body at lines 39-53 — it only calls
  `setAllowed` from the fetch response, never defaults to `true` on error).
- `initialGeoAllowed` is a **required** prop with no default
  (`TournamentListProps` interface, `TournamentList.tsx:23-32`) and is
  supplied only by `app/app/tournaments/page.tsx:27`, which resolves it via
  `resolveRankedEligibility(await headers())` at request time
  (`page.tsx:25`). Grepped the repo — `TournamentList` has exactly one
  caller.
- Allowed-region case: same ternary's final branch renders the tier picker
  (`CHIP_TIERS` grid) and the idle-state "Join queue" button — unaffected by
  this diff (see AC-5).

## AC-2: `/tournaments` absent from `.next/prerender-manifest.json`'s static list; first HTML has no paid markup in any case

**Result: PASS — live-verified**

- Ran `pnpm build` in `app/` myself. Route table shows `ƒ /tournaments`
  (dynamic), alongside `ƒ /duel` and `ƒ /duel/chips`.
- Parsed `.next/prerender-manifest.json` directly:
  `'/tournaments' in routes` → `false`; no `tournament` substring in either
  the static `routes` map or `dynamicRoutes` map. Total static routes: 25,
  none tournament/duel-related.
- Started `pnpm start` and curled `http://localhost:3411/tournaments`
  anonymously:
  - `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`
    — confirms the response is not shared-cacheable.
  - Response body: `grep -c "Join queue"` → 0, `grep -c "Choose entry fee"` →
    0, tier-chip markup → 0 occurrences. `grep -c "Sign in to enter
    tournaments"` → 1 (SignInGate, as expected for an anonymous request).
  - This directly proves the negative claim required by AC-2 (no paid markup
    in the first HTML, in the anonymous case) without relying on the
    known-false-alarming "curl and check for region copy" method.
- Per the documented caveat, I did **not** attempt to prove the
  authenticated+allowed / authenticated+blocked first-HTML cases live (no
  real Firebase session available in this environment). Those are covered by
  the code-inspection evidence under AC-1 (required prop, no default,
  `useState` seeded synchronously from the server value — there is no
  server-rendered "optimistic" HTML variant to curl for, since the page
  itself is `force-dynamic` and always resolves `allowed` server-side before
  rendering `TournamentList`).
- Reverted the `app/next-env.d.ts` churn from my own `pnpm build` run
  (`git checkout -- app/next-env.d.ts`) and re-ran `pnpm typecheck` clean
  afterward, per the known repeat pitfall recorded in `loop/learnings.md`.
  Killed the local `pnpm start` process after curling; final `git status`
  is byte-identical to the intended 4-file diff plus the four untracked
  upstream handoff JSONs.

## AC-3: Queue-route guard structurally identical to checkout/register siblings

**Result: PASS — independent spot-check by direct read (not solely citing upstream)**

Read all three files myself side by side:

| | queue/route.ts | [id]/checkout/route.ts | [id]/register/route.ts |
|---|---|---|---|
| Call | `assertPaidDuelAllowed(request)` | same | same |
| Check | `if (!geo.allowed)` | same | same |
| Envelope | `{ error: "Not available in your region", code: "GEO_BLOCKED", reason: geo.reason }`, status 403 | identical | identical |
| Position | after `requireAuth` block, before `checkRateLimit` | same | same |
| Import path | `../../../../src/lib/paidDuelGeo` (4 levels — file is not under `[id]/`) | `../../../../../src/lib/paidDuelGeo` (5 levels) | same 5 levels |

Import depth difference (4 vs 5) is correct given `queue/route.ts` sits one
directory shallower than the `[id]/`-nested siblings. Confirmed by hand-
counting `..` segments against the file's own directory
(`app/app/api/tournaments/queue/route.ts` → 4×`..` → `app/`, and
`app/src/lib/paidDuelGeo.ts` exists).

Positive, independent proof that the import actually resolves (not just
"looks right by counting dots," and not solely relying on typecheck, which
is blind here due to `@ts-nocheck` — confirmed the file still carries
`@ts-nocheck` at line 1): my own fresh `pnpm build` run (for AC-2 evidence)
emitted `ƒ /api/tournaments/queue` in the route table. Webpack cannot emit a
route whose import fails to resolve, so the build is positive evidence the
path is correct — independent of the three upstream agents' builds.

Confirmed unreachability (so no runtime 403 test was expected or written,
per the task's explicit caveat): `POST` unconditionally `return comingSoon()`
at line 31, before the guard at line 46. `GET` does the same at line 20.

## AC-4: No regression to checkout/register or the shared geo core

**Result: PASS — live-verified via `git diff HEAD`**

Ran independently:
```
git diff HEAD -- app/src/lib/paidDuelGeo.ts            → 0 lines
git diff HEAD -- app/src/lib/rankedEligibility.ts       → 0 lines
git diff HEAD -- app/src/hooks/useRankedEligibility.ts  → 0 lines
git diff HEAD -- app/app/api/tournaments/[id]/checkout/route.ts → 0 lines
git diff HEAD -- app/app/api/tournaments/[id]/register/route.ts → 0 lines
```
All five are byte-untouched by this diff. `git diff HEAD --stat` confirms
the changeset is exactly `app/app/api/tournaments/queue/route.ts`,
`app/app/tournaments/page.tsx`, `app/src/components/Tournament/TournamentList.tsx`,
and `loop/learnings.md` (ledger-only edit).

## AC-5: Coherent UX for signed-in + allowed region; existing queue-join flow otherwise unaffected

**Result: PASS — by reading, not by exercising real chip-purchase flows (per task instruction)**

Read the full diff on `TournamentList.tsx` (`git diff HEAD`): the only
changes are (1) one new import, (2) the new `TournamentListProps` interface
and required prop, (3) one new hook call, (4) one new ternary branch (the
region-restricted block) inserted between the existing `!user` and `else`
branches. `handleJoin`, the tier-picker grid, and the four-way `joinState`
render (idle/joining/queued/error) are byte-identical to before — confirmed
by diff, not re-typed from memory. Double-submit protection (button only
renders in the `idle` sub-state) is pre-existing and untouched.

Confirmed the underlying queue-join business logic is untouched:
`git diff HEAD -- app/src/db/tournaments.ts` → 0 lines,
`git diff HEAD -- app/src/config/tournaments.ts` → 0 lines (chip debit,
bracket-fill logic, and the `TOURNAMENTS_ENABLED` kill switch itself are
all outside this diff's blast radius).

## Flows check

No dedicated Flows/F-n exist for this change in `loop/spec.md` (see note
above). Walking the join-queue flow end-to-end by reading (discovery →
`/tournaments` route → entry via tier picker → "Join queue" action →
success/queued state → "View bracket" link) shows it is unaffected by this
diff outside of the new region gate sitting in front of it — consistent with
the software-engineer's stated intent (gating-only change, zero new business
logic).

## Known caveats — respected, not treated as failures

1. Anonymous curl always shows SignInGate — expected, confirmed live, not
   scored as an AC-1 failure.
2. Did not POST to `/api/tournaments/queue` expecting 403 — confirmed via
   reading that `comingSoon()` precedes the guard; no such test written.
3. Confirmed `@ts-nocheck` blinds typecheck to the import; used my own
   `next build` (route emitted successfully) as positive resolution proof,
   not "typecheck passed."
4. Did not fail any AC over the `PAID_DUELS_ENABLED` kill-switch /
   reason-collapse UX issue (page.tsx threads only `allowed`, not `reason`)
   — this is the same pre-existing, already-ledgered, non-blocking issue
   reviewer and security-reviewer both filed; noted here for completeness,
   not scored.

## Verdict

All 5 ACs pass. No critical or blocking findings. Recommend proceeding to
integrator.
