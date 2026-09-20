# QA Acceptance Report -- Challenge/Friend identity resolution + username search

**Date:** 2026-09-20
**Feature:** Replace "Someone" placeholder with `climberDisplay` name resolution on every
friend-request / challenge surface (mobile + web); add exact-match username search
alongside exact-match email search.
**Commits reviewed:** `777641d`..`97551c8` (branch `claude/lucid-fermat-3cbvbc`)
**Prior stages:** verifier (`verifier-2026-09-20T020757Z`), reviewer
(`reviewer-2026-09-20T023000Z`, APPROVED), security-reviewer
(`security-reviewer-2026-09-20T021500Z`, no findings) — all green.
**Verdict:** PASS -> integrator

## Method

- Read every prior handoff for this loop (software-engineer x2, verifier, reviewer,
  security-reviewer) plus `context/trust.md`, `context/gates.json`.
- Re-ran the full suite myself rather than trusting reported numbers: `pnpm lint`,
  `pnpm typecheck`, `pnpm test` — all green, 85 files / 799 tests, matching the
  verifier's and reviewer's reported baseline exactly.
- Read the production code end-to-end for every touched surface (not just the diff):
  `src/lib/handle.ts`, `src/lib/userSearchQuery.ts`, `app/api/users/search/route.ts`,
  `app/api/challenge/route.ts` + `[id]/accept` + `[id]/decline`, `app/api/friends/route.ts`
  + `[id]/accept`, both `UserSearch`/`UserSearchSection`, both `FriendRequests`/
  `FriendRequestsSection`, both `FriendsList`/`FriendsListSection`, both
  `PendingChallenges`/`PendingChallengesSection`, `DuelHome.tsx`, `ChallengeScreen.tsx`.
- Ran the relevant test files directly and read their assertions to confirm they
  invoke the real production functions (`climberHandle`, `climberDisplay`,
  `exactMatchFilter`, `isSearchableQuery`, `searchFailureMessage`) rather than
  re-implementing or grepping for text, per `.claude/rules/testing.md`.
- Independently reproduced one prove-fail cycle myself (did not just trust the
  verifier's/reviewer's claim): flipped `c.sender.username &&` to `false &&` in
  `PendingChallenges.tsx`, reran `tests/components/pendingChallengesIdentity.test.tsx`
  — 2/4 red with the exact assertion failure previously reported — then restored the
  file and confirmed `git diff --stat` is empty and the suite is green again.
- No running dev server / Playwright available in this environment; validation is
  code-trace + direct unit/component-test invocation (scripted user flows), which
  the skill ranks above static-only checks and is appropriate given the extensive
  existing component-level test harness (real DOM render, stubbed `fetch`, real
  imported helpers).

## Quality gates (re-run by me, not just read from handoffs)

| Gate | Status | Evidence |
|------|--------|----------|
| app-lint | PASS | `pnpm lint` exits 0, `--max-warnings=0` |
| app-typecheck | PASS | `pnpm typecheck` (`tsc --noEmit`) exits 0 |
| app-test | PASS | 85 files / 799 tests passed, 8.67s |
| Prove-fail (mine) | PASS | Sub-line gate flipped to `false &&` → 2/4 tests red with the reported assertion; restored → 4/4 green, clean diff |

## Acceptance criteria (from the original bug report + clarification)

### AC-1: Show a resolved name (not "Someone") for challenge/friend-request senders and recipients — PASS

| Check | Method | Expected | Actual | Evidence |
|-------|--------|----------|--------|----------|
| Incoming friend request | Unit/render | `climberDisplay(sender.id, sender.displayName)` | Matches | `FriendRequests.tsx:188`, `FriendRequestsSection.tsx:168` |
| Outgoing friend request | Unit/render | `climberDisplay(receiver.id, receiver.displayName)` | Matches | `FriendRequests.tsx:243`, `FriendRequestsSection.tsx:216` |
| Incoming challenge | Unit/render, mutation-proven | Pseudonym or real name + `@username` | `PendingChallenges.tsx:187,199-203`, `PendingChallengesSection.tsx:179,188-190` | `tests/components/pendingChallengesIdentity.test.tsx`, `mobilePendingChallengesIdentity.test.tsx` (4/4 each, both proven to fail without the fix) |
| Outgoing challenge | Unit/render | Same, "Waiting for X" | Matches | same files, lines 246/257-261 and 233/241-243 |
| Friends list row | Unit/render | `climberDisplay` + `@username` | Matches | `FriendsList.tsx:112-113`, `FriendsListSection.tsx:113` |
| Search result row | Unit/render | `climberDisplay` + `@username` preview before acting | Matches | `UserSearch.tsx:190-193`, `UserSearchSection.tsx:163,172-173` |
| No email ever rendered/exposed on these surfaces | Static read + `climberDisplay`/`climberHandle` source | Never touches `email` field | `handle.ts` takes only `id`/`displayName`; all `ChallengeItem`/`Friend`/search DTOs carry `username`+`displayName`, never `email` | `handle.ts:31-48`, all interface shapes above |
| Push/in-app notification bodies (friend request, friend accepted, challenge received, challenge accepted/declined) | Static read + route test | Resolved name in `title`/`body` | `climberDisplay(...)` used in all 5 notification call sites; `NotificationFeed.tsx` renders `title`/`body` verbatim | `app/api/friends/route.ts:103,108`, `.../accept/route.ts:66,71`, `app/api/challenge/route.ts:107,113`, `.../accept/route.ts:61-64`, `.../decline/route.ts:53-57` |
| Literal `"Someone"` anywhere in the friend/challenge flow | Grep across `app/`, `mobile/`, `src/` (excluding tests/comments) | Zero hits | Zero hits (only unrelated code comments elsewhere) | confirmed via `rg "Someone"` |

### AC-2: Search by exact email OR exact username — PASS

| Check | Method | Expected | Actual | Evidence |
|-------|--------|----------|--------|----------|
| Exact email match, case-insensitive | Unit (real route via mocked Prisma) | Finds user | PASS | `tests/api/usersSearch.route.test.ts` |
| Exact username match, case-insensitive, leading `@` tolerated | Unit | Finds user | PASS | same file |
| Partial/substring email or username | Unit | Never matches | PASS, and mock only matches on `equals`, not `contains` | same file |
| Malformed/too-short input | Unit | Never touches DB | PASS, `findFirst` not called | same file |
| Self-exclusion preserved on username path | Unit | `id: {not: uid}` present, unoverridable by filter spread | PASS | same file + security-reviewer's independent check of spread order |
| Rate limit unchanged (60/hr, fail-closed) | Unit | 429 before DB touch | PASS | same file |
| Anti-enumeration invariant (no `contains`/`startsWith`/injection-shaped input ever reaches a filter) | Unit, adversarial fixtures (SQL injection, NoSQL operator shape, wildcard, path traversal, reserved names) | All return `null`/`{users:[]}` | PASS, 9/9 adversarial + reserved-word fixtures rejected | `tests/lib/userSearchQuery.test.ts` |

## Flow validation

### F-1: Add a friend by username instead of email (golden path) — PASS

**Method:** Code trace (`UserSearchSection.tsx` / `UserSearch.tsx`) + direct component-test
invocation (`tests/components/challengeIdentity.test.tsx` "UserSearch — result preview...").
**Result:** Typing a valid username fires the debounced search (300ms) once
`isSearchableQuery` is true; a match renders `climberDisplay(id, displayName)` +
`@username` in the result row *before* any action is taken (the "preview" the bug
report asked for); tapping "Add" POSTs `/api/friends`, disables the button while
in flight, and on success flips the row to "Sent" without a page reload. The
same person then appears in "Sent requests" (`FriendRequestsSection`/
`FriendRequests`) under the *same* `climberDisplay` name — verified by reading
both components' use of the identical helper on the identical `id`. Works with
no display name and no username on the recipient (pseudonym shown), and with a
username-only recipient (pseudonym + handle shown). No email is ever shown or
required to be shared by the searched-for user.

### F-2: Challenge a stranger (golden path) — PASS, with a scoping note

**Method:** Code trace (`createChallenge` in `src/db/challenge.ts`, `PendingChallenges`/
`PendingChallengesSection`) + direct component-test invocation using a sender id
that exists in no friends list (`stranger-1`, `stranger-2`, `stranger-3` fixtures).
**Result:** `createChallenge` has no friendship check (confirmed by reading
`src/db/challenge.ts:33-71` — only self-challenge, pending-count, and duplicate
checks). The recipient of an incoming challenge from a display-name-null,
username-set stranger correctly renders `"<pseudonym> challenged you"` +
`"@<username>"` + the expiry countdown, in **both** trees, proven by mutation
testing (my own repro: flipping the `username &&` gate to `false` turns 2 of 4
assertions red per tree; restored clean). This is exactly the "real name, or at
minimum a pseudonym + `@handle`" bar the task asked for — never a raw "Someone"
and never an email.
**Note (non-blocking):** the *live UI* only exposes challenge-sending via the
Friends list (`FriendsList`/`FriendsListSection` "Challenge" button) — there is
no "challenge a non-friend directly from search" button today, so a human tester
clicking through the app cannot literally reach a same-session true-stranger
challenge without first accepting/sending a friend request. The one live path to
challenge someone with zero relationship is the "Or share a link" flow
(`POST /api/duel`), which creates a `Duel` directly (not a `Challenge` row) and
is unrelated to this fix; its lobby is `DuelRoom.tsx`, which is the "Player 1/2"
placeholder screen addressed in the next section. The identity-resolution code
itself is correct and tree-consistent for a true stranger (proven above); the
gap is that no in-app button currently *sends* an unsolicited Challenge-model
invite to a stranger. Recommend a one-line follow-up note to product/
software-engineer rather than a loop-back, since it does not regress or fail
anything this diff was asked to fix.

### F-3: Discovery of username search — PASS

**Method:** Static read of both search components and their parent screens.
**Result:** Placeholder text "Search by email or username…" on both mobile and
web inputs; web additionally has a persistent hint line above the input,
"Find players by email or username." (`DuelHome.tsx:508-509`). Single input
field handles both email and username with no mode toggle, so there is no
"which mode am I in" confusion — the distinction is invisible to the user and
seamless, matching the request that a user not have to consciously choose
"private email lookup" vs "public handle lookup."

### F-4: Empty / edge states — PASS

| Case | Method | Result |
|------|--------|--------|
| No match (valid shape, no such user) | Unit (`usersSearch.route.test.ts`) + component render | `{users: []}` → UI shows "No user found with that email or username." (both trees), gated so it can never co-render with a stale result or an error |
| Rate-limited (429) | Unit, mutation-proven (`userSearchFailureBranch.test.tsx`) | Both UIs clear any previous result row *and* its action button, show "Too many searches. Try again in a little while.", `role="alert"`; proven to fail (stale row survives) when the fix's `setResults([])` line is removed |
| Network/fetch throw | Component render | "Network error. Try again." shown, same clearing behavior |
| No display name, no username | Unit (`climberHandle`) + 6+ component tests across both trees | Deterministic pseudonym (e.g. "Swift Ibex 42") everywhere; never "Someone", never email |
| Username set, no display name | Unit + component tests | Pseudonym as primary line + `@username` sub-line — never a bare, unidentifiable pseudonym |
| Loading never gets stuck | Static read | `setLoading(false)` runs unconditionally after the try/catch in both search components (not inside a `finally`, but placed so every code path reaches it) — confirmed by reading control flow, no early `return` skips it |

### F-5: Mobile vs. web consistency — PASS

Read all 4 component pairs line-by-line (not just their handoff claims):
`UserSearch`/`UserSearchSection`, `FriendRequests`/`FriendRequestsSection`,
`FriendsList`/`FriendsListSection`, `PendingChallenges`/`PendingChallengesSection`.
All four pairs are behaviorally byte-equivalent: same helper calls
(`climberDisplay`, `isSearchableQuery`, `searchFailureMessage` — the mobile tree
imports the identical modules via the `@app/*` alias, not a duplicated copy),
same gating logic for the `@username` sub-line, same error/empty/loading states,
same button-disable-while-in-flight behavior. This was the exact defect class
the reviewer caught last round (mobile got the sub-line fix, web didn't, until
the verifier added the missing web test) — re-confirmed closed: both trees now
have equal automated coverage (`pendingChallengesIdentity.test.tsx` /
`mobilePendingChallengesIdentity.test.tsx`, 4 cases each).

### F-6: Downstream duel-room identity ("Player 1"/"Player 2") — non-blocking, confirmed out of scope

**Method:** Grep + static read of `DuelRoom.tsx`, `DuelRoomScreen.tsx`,
`DuelWatch.tsx`, `TournamentBracket.tsx`.
**Result:** Confirmed still present and untouched by this diff:
`meta.player1?.displayName ?? "Player 1"` / `player2Name ?? "Player 2"` in both
`DuelRoom.tsx:1194-1195` and `DuelRoomScreen.tsx:257-258`. This means: a
recipient who accepts a challenge from a display-name-null, username-set
stranger (correctly shown as "Swift Ibex 42" + `@handle` on the challenge card)
lands in the duel room to see that same opponent called "Player 2" — a real,
visible identity discontinuity across the accept → duel-room transition.
**Assessment:** confirmed present, but per the explicit scope boundary given for
this QA pass, this is a pre-existing, separately-tracked gap in a different
screen (`DuelRoom`/`DuelResult`/`DuelWatch`/`TournamentBracket`, none of which
were in this diff's artifact list, and the reviewer already logged it as a
follow-up in a prior round). It degrades from "named person" to "generic label"
rather than to "wrong person" or a broken/blocked state, and only triggers when
displayName is unset — it does not block, break, or contradict anything this
feature promises on the challenge/friend screen itself. Not a reason to hold
this diff; flagging again here so it isn't lost before a follow-up ticket is
filed.

## Exploratory pass

| Scenario | Result |
|----------|--------|
| Double-submit (rapid double-tap Add/Challenge/Accept) | Blocked — `actioningId`/`challengingId`/`acceptingId` disable the acting button and gate a second dispatch in every one of the 4 component pairs |
| Navigate away mid-search | Debounce timers cleared on unmount via `useEffect` cleanup in both search components |
| Refresh mid-flow | No persisted client state; component remounts to a fresh `loading` fetch; server-side data is authoritative, no stale-state risk |
| Out-of-order search responses (fast 429 then a slow success for an earlier keystroke) | **Known, pre-existing, non-blocking gap** — already identified and logged by the reviewer (`reviewer-2026-09-20T023000Z.json`) as no `AbortController`/sequence guard exists in either search component; confirmed still true by reading the same code. Does not regress anything this diff shipped (the same gap existed before the error-branch fix); recommend the reviewer's follow-up ticket stands. |
| Self-search / self-challenge | `id: {not: uid}` in search; `self_challenge`/`self` outcomes explicitly handled in both challenge and friend POST routes |

## Structural spec-gate note (process, non-blocking)

There is no `loop/spec.md` (or dedicated spec file) for this feature —
`paths.spec` currently points at an unrelated in-progress spec
("1v1 Quick Play on Mobile"). This bug-fix loop ran directly from the user's
bug report + clarification carried in each stage's dispatch, skipping the
product-spec/architect stages, which is a legitimate lightweight path for a
well-scoped bug fix but leaves no persisted Flows/AC document to point future
readers at. I validated against the AC list embedded in my own dispatch
instead. Recommending (learning, not a loop-back) that small identity/bug-fix
loops still get a 10-line spec snippet for traceability — not blocking this
merge, since the actual behavior fully satisfies every criterion given to me.

## Go / no-go

**GO.** All explicit acceptance criteria pass with real invoked evidence (unit
tests, mutation-proven component tests, and direct route/DB-layer reasoning),
mobile and web trees are confirmed consistent rather than assumed so, gates are
green, and the two known non-blocking gaps (duel-room "Player 1/2" placeholders;
out-of-order search response race) were both already identified pre-loop-back by
the reviewer and independently re-confirmed here as out of this diff's scope and
non-regressive. Recommend merge.
