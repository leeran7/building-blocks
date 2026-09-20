# QA Acceptance Report — Server-side paid-duel region eligibility

**Date:** 2026-09-20
**Stage:** qa-acceptance
**Prior stages:** software-engineer, verifier, reviewer, security-reviewer — all `success`, no critical findings.

## Method

Local build + start (`pnpm build` then `pnpm start -p <port>`), with
`PAID_DUEL_GEO_ENFORCE=true` so the geo allow-list is enforced outside
production. Spoofed Vercel's edge geo headers (`x-vercel-ip-country`,
`x-vercel-ip-country-region`) via curl against the running local server and
inspected the **raw HTML response bytes** (no JS execution) plus response
headers. No live preview deployment was available, so AC-3's authenticated
case is validated by code-path reading rather than a real session — called
out explicitly below, per the task's caveat.

`PAID_DUELS_ENABLED=true` and `NEXT_PUBLIC_PAID_DUELS_ENABLED=true` were
already present in the shell environment and were baked into the one
production build I ran. A second `pnpm start` (no rebuild) with
`PAID_DUELS_ENABLED=false` let me exercise one more kill-switch combination
without a second full build, since that var is read server-side at process
start; `NEXT_PUBLIC_PAID_DUELS_ENABLED` is inlined at build time, so the two
combinations with it `false` are validated by code inspection only (documented
below), to avoid a second full rebuild for marginal gain that upstream agents
had already logically covered.

## AC-1: `/duel`, blocked region, first paint shows unavailable, no flash

**PASS — verified by live request.**

`curl -H 'x-vercel-ip-country: US' -H 'x-vercel-ip-country-region: NY' http://localhost:3900/duel`

Raw HTML response contains, twice, genuine markup (not a JSON blob):
```
<span class="...">Not available in your region.</span>
```
and badge text `unavailable` (x2), for both the "Chip Duels" and
"Tournaments" mode cards. The embedded RSC payload in the same response
carries `"initialGeoAllowed":false` — i.e. the value serialized to the
client for hydration is already the correct, final answer, not an
optimistic `true` that gets corrected afterwards. `Cache-Control: private,
no-cache, no-store, max-age=0, must-revalidate` — not shared-cacheable, so
this can't be a stale cached "allowed" response either. No `x-vercel-cache`
or `age` header present (expected locally; the Cache-Control header alone
rules out heuristic shared-cache reuse per RFC 9111 §4.2.2, matching the
security-reviewer's SEC-1 analysis).

## AC-2: `/duel`, allowed region, first paint shows available, no flash

**PASS — verified by live request.**

Same request with region `CA`. Raw HTML shows, in the Chip Duels card:
```
Chip Duels</span><span class="...bg-signal/15 text-signal">ranked</span>...
<span class="...">Stake chips — winner takes all. Non-cashable.</span>
```
— the available/ranked state, on the first byte, with none of the blocked
copy present anywhere in the response. Tournaments card shows `coming soon`
(not `unavailable`). Same non-cacheable `Cache-Control`.

## AC-3: `/duel/chips`, stake picker/Find match never visible to a blocked user, correct for allowed user

**PASS — verified by code inspection (auth-gated case) + live request (anonymous case, confirms the reviewer's documented caveat rather than a false pass).**

Live anonymous curl to `/duel/chips` for both NY and CA returns the
SignInGate ("Sign in...") regardless of region — exactly as the reviewer's
open item predicted: `ChipDuelLobby` checks `!user` before `!geoAllowed`,
and `useAuth()` resolves client-side only (default context value
`{ user: null, ... }`, confirmed by reading `AuthContext.tsx`), so an
anonymous SSR request can never reach the geo branch. I did **not** treat
this as a passing (or failing) assertion of AC-3 — a naive "curl and check
for absence of the stake picker" here would trivially pass for the wrong
reason and was explicitly flagged as a trap to avoid.

Verified the actual load-bearing property by reading
`app/src/components/Duel/ChipDuelLobby.tsx:111-125` directly: the render is
a single ternary chain with no other code path to the stake
picker/"Find match" button:
```tsx
{!user ? (
  <SignInGate .../>
) : !geoAllowed ? (
  <section>Region restricted...</section>
) : (
  <>...tier picker + "Find match" button...</>
)}
```
This is exactly `user && geoAllowed` gating the money-moving markup — there
is no other branch, no fallthrough, and no separate loading state that
renders the third branch. `geoAllowed` comes from `useRankedEligibility(true,
initialGeoAllowed)`, whose internal state is `useState<boolean>(serverAllowed)`
(never `null`) and is only ever overwritten by a value that is itself
`typeof === "boolean"` from the identical server-derived
`/api/geo/ranked` helper — so there is no reachable path where the third
branch renders before the true geo answer is known, for either an
already-hydrated or a still-hydrating authenticated session. `user` starts
`null` in `AuthContext`'s default value and its own `useState`, so even a
legitimately authenticated visitor sees the SignInGate (not the stake
picker) until Firebase resolves client-side — pre-existing, unrelated to
this diff, and not a path that can leak the money UI early.

I could not stand up a real authenticated session (no Firebase ID token
available in this environment) to additionally observe this live; this
finding is code-inspection only, as anticipated by the task's own guidance.

## AC-4: `/api/geo/ranked` JSON shape unchanged

**PASS — verified by live request (own independent check) + upstream diff confirmation.**

```
GET /api/geo/ranked (NY)  -> {"allowed":false,"reason":"not_allowlisted"}
GET /api/geo/ranked (CA)  -> {"allowed":true,"reason":null}
```
Shape is `{ allowed: boolean, reason: string | null }` in both cases,
matching the pre-existing contract. Verifier and reviewer already diffed
the route source against HEAD and confirmed byte-identical response
construction; this is my own independent live confirmation on top of that.

## AC-5: No regression to money-movement enforcement

**PASS — verified by one independent live spot-check + upstream diff/grep confirmation (already exhaustively done by verifier/reviewer/security-reviewer).**

`git diff --name-only HEAD` (re-checked myself) touches none of
`paidDuelGuards.ts`, `api/duel/chips/match/route.ts`,
`api/tournaments/[id]/checkout/route.ts`,
`api/tournaments/[id]/register/route.ts`, or `api/credits/checkout/route.ts`.
Live spot-check of my own: `POST /api/duel/chips/match` with no auth header
(and blocked-region headers) returns `401` — confirming `withAuth` still
gates the handler before `assertPaidDuelAllowed` is ever reached, unaffected
by this diff. Full ordering/behavior-preservation of `assertPaidDuelAllowed`
→ `decidePaidDuelGeo` was already mechanically diffed line-for-line by the
security-reviewer; I re-read `paidDuelGeo.ts` myself and agree the delegate
is a one-line passthrough with unchanged allow-lists and ordering.

## Flows walked (F-n)

`loop/spec.md` is the "1v1 Quick Play on Mobile" spec — an unrelated,
separate feature (mobile Capacitor Quick Play queue). It has no Flows
section describing this paid-duel-geo change, and this change's five ACs
were supplied directly in the QA task rather than derived from that spec.
This is not a structural spec gate failure to loop back on — the geo
eligibility change is a targeted fix to an existing surface, not a new
Flows-bearing feature, and the task explicitly enumerated the ACs to
validate. I did still walk the actual end-to-end flow for both `/duel` and
`/duel/chips` (discovery → entry → act → success/blocked-next) as part of
AC-1 through AC-3 above: a blocked-region visitor lands on `/duel`, sees the
mode cards already marked unavailable with an explanation (no dead end — the
free "Quick Play" and "Challenge" modes remain fully usable), and never
reaches a live "Find match" button on `/duel/chips`. An allowed-region
visitor sees the same surfaces as fully live from the first frame.

## Discovery / kill-switch combination pass

Walked the rendered UX (not just the boolean logic, which the reviewer
already covered) for the kill-switch combinations:

| `PAID_DUELS_ENABLED` (server) | `NEXT_PUBLIC_PAID_DUELS_ENABLED` (client) | Verified how | Result |
|---|---|---|---|
| true | true | live, both NY and CA | AC-1/AC-2 above — correct, no flash |
| false | true | live (CA, allowed region) | Chip Duels/Tournaments cards **still show "Not available in your region." / "unavailable"** even though the true reason is the kill switch, not geo. Confirmed live. **Pre-existing, non-blocking** — this is exactly the reviewer's warning finding (`app/app/duel/page.tsx:27` etc. destructuring only `{ allowed }` and discarding `reason`), not a regression introduced by this diff (the old client-only probe had the same blind spot), and it is not a flash/first-paint defect — the (misleading) copy is consistent from the first byte. No broken/missing badge; the state is internally consistent, just mislabeled. |
| true | false | code inspection only (requires a rebuild; not exercised live) | `DuelHome`'s paid mode cards are gated by `{paidEnabled && (...)}` where `paidEnabled = PAID_DUELS_ENABLED_PUBLIC` — with this false, the Chip Duels/Tournaments cards render **not at all** (clean hidden state, no broken UI). `ChipDuelLobby` does not consult `PAID_DUELS_ENABLED_PUBLIC` at all (pre-existing, per reviewer's finding it hardcodes `enabled=true` for the revalidation probe) — a user who navigates directly to `/duel/chips` would still see a fully working lobby if the server-side kill switch is on and geo allows. This is a pre-existing entry-point-vs-page inconsistency, **unrelated to this diff** (same hardcoded `true` existed before), not a flash bug, not a money-movement bypass (enforcement is still server-checked independently at `/api/duel/chips/match`). |
| false | false | code inspection only | Mode cards hidden entirely on `/duel` (clean). `/duel/chips` shows "Region restricted" copy (same reason-collapsing issue as row 2) instead of a kill-switch-specific message, but again consistent from first paint, no flash, no broken state. |

None of the four combinations produces a missing badge, a mismatched
subtitle/badge pairing, or an observable flash. The one real UX issue
(kill-switch-off mislabeled as "region restricted") is the reviewer's
already-filed non-blocking warning, not a new defect, and does not fail any
of AC-1 through AC-5.

## Exploratory pass

- **Refresh mid-flow / direct navigation:** every request tested was a
  fresh `curl` (no session/cookie reuse), which is equivalent to a hard
  refresh or direct URL entry — the correct decision showed on every single
  one, with no cross-request caching. No stale state observed.
- **Empty/missing geo headers:** already covered by upstream unit tests
  (`missing_geo` → deny) and is exercised on every real request that lacks
  the two Vercel headers (e.g. any request through a non-Vercel front door)
  — fail-closed, consistent with `context/trust.md`'s posture.
- **Double-submit / navigate-away:** out of scope for this diff (display-only
  change); the money-moving submit handlers (`handleMatch` in
  `ChipDuelLobby.tsx`) were not touched and were not re-tested here since
  AC-5 scopes them as unchanged, already confirmed by diff.

## Verdict

All five ACs (AC-1 through AC-5) **PASS**. No untestable ACs. No structural
spec-gate failure (the ACs were supplied directly, not derived from a Flows
section, and this is a targeted fix to an existing surface, not a new
Flows-bearing feature). One pre-existing, non-blocking UX nit reconfirmed
live (kill-switch-off mislabeled as region-blocked) — already filed by the
reviewer as a non-blocking warning; not a regression from this change and
does not fail any AC.
