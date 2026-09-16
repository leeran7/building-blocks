# Spec: Post-challenge messaging (mobile only)

**Product:** The Climb (building-blocks) — DB/code name "Duel"
**Goal ID:** post-challenge-messaging
**Status:** draft → ready for architect
**Date:** 2026-09-16

## Goal

Once a duel ("challenge") reaches `completed`, let the two real (non-guest)
participants exchange short text messages about that duel from the native
mobile app — so a climber can say GG, talk trash, or arrange a rematch —
without leaving the app or trading outside contact info. Web (Next.js)
surfaces are unaffected in v1.

---

## Scope

### In scope

1. Text-only chat scoped to one completed `Duel`, for its two participants
   (`player1_id`, `player2_id`) when **both** are Firebase-authenticated
   users (no guests).
2. Entry point: a "Message opponent" affordance on `DuelRoomScreen`
   (mobile) once `duel.status === "completed"`.
3. Persisted history (`GET`) + send (`POST`) API under
   `app/app/api/duel/[id]/messages`, backed by a new `DuelMessage` table.
4. Live delivery over the existing Ably infra (new `duel-chat:<duelId>`
   channel capability) with the DB as source of truth — Ably is transport,
   not storage.
5. Per-user **Block** (stop sending/receiving with that user, across all
   duels) and **Report** (capture for manual review) — treated as
   mandatory v1 scope, not follow-ups, because this pairs strangers who
   just played a real- or virtual-money duel.
6. Abuse resistance: message length cap, per-user send rate limit, no
   edit/delete-for-everyone after send ("unsend for me" hide only).
7. Mobile-only UI: new screen(s)/components under `app/mobile/src/screens`
   and `app/mobile/src/lib`.

### Out of scope / non-goals

- Web (Next.js) chat UI — the API is shared, but no `app/app/duel/[id]`
  web page gets a chat surface in v1.
- Messaging before `completed` (no chat/taunting during countdown or climb).
- Messaging for guest players (`player1_id`/`player2_id` starting with
  `guest:`) — no account exists to notify or moderate later, so guest
  duels get no chat entry point at all.
- Group chat, media/image/video attachments, voice, read receipts beyond
  "delivered".
- A global inbox / DMs unrelated to a specific duel — a thread is always
  scoped to one `duel_id`.
- Block affecting future **matchmaking** pairing — block only stops
  messaging; excluding a blocked user from matchmaking is a separate,
  larger system change and explicitly out of scope for v1.
- Push notifications for new messages (no push infra exists for this app
  yet — follow-up, not a v1 blocker for in-app chat).
- Automated profanity/toxicity filtering (Block/Report is the v1 control).
- An admin moderation UI for reports (v1 captures reports in the DB only).

### Assumptions

- "Challenge" (product/UI term) and "Duel" (DB/route term) name the same
  entity; this doc says "duel" for precision, "challenge" only in
  user-facing copy, matching existing `DuelMode` usage.
- Mobile means the Capacitor-bundled SPA in `app/mobile` (its own screens,
  `CapacitorHttp` + Firebase bearer auth) — not a responsive web
  breakpoint. Confirmed: no React Native codebase exists.
- Ably (`app/src/net/realtime.ts`, `app/app/api/realtime/token`) is the
  only realtime provider and is reused rather than adding a second one.
- `requireAuth` (Firebase ID token) is required on every messaging
  endpoint — no guest-token path, unlike some existing duel routes.
- A duel's two participants are fixed for its lifetime; a rematch is a new
  `Duel` row with its own, empty chat thread — chat does not carry over
  via `rematch_duel_id`.

### Constraints

- No new runtime dependency for realtime; extend the existing Ably
  token-scoping route rather than adding a second provider.
- Package manager for `app/`: pnpm; mobile screens follow existing
  `app/mobile` SPA patterns.
- Message body: plain text, hard cap (**1000 chars** — TBD by
  architect/product), stored server-side. A recipient must never trust an
  Ably payload alone: every message they see was accepted by the `POST`
  endpoint first (Ably publish happens server-side, after the DB insert —
  never client-to-client).
- Must follow `context/trust.md` #5 (authorization lives in route
  handlers via `requireAuth`, not middleware) and #6 (allow-list /
  reject-never-default; a `GET` history endpoint must not write-on-read).
- Touch targets ≥44×44 CSS px; ASCENT tokens only (`app/DESIGN.md`), no
  second visual language.

---

## Personas

### P1 — Climber sharer / winner

Just won or lost a duel against a real opponent (matchmaking or an invite
link), on the mobile app. Wants to say GG or propose a rematch.

### P2 — Harassment target (must be protected)

Was matched against a stranger via random matchmaking and received an
unwanted or abusive message. Needs one-tap Block and Report that take
effect immediately — the blocked sender can never message them again, in
this thread or a future one.

### P3 — Friend duelist

Challenged a friend directly via an invite link; completed the duel; wants
a normal, low-friction chat about the run.

---

## Stories

### S1 — Open chat after a completed duel

**As a** duelist, **I want** a way to message my opponent once the duel is
completed, **so that** I can talk about the run without leaving the app.

- **Happy path:** `DuelRoomScreen` shows "Message opponent" once
  `status === completed` and both players are real accounts → tapping
  opens the thread for that `duel_id`.
- **Failure case:** Either participant is a guest → no chat entry point is
  rendered (absent, not disabled).

### S2 — Send and receive messages

**As a** duelist, **I want** to send a short text message and see my
opponent's reply live, **so that** we can have a real conversation.

- **Happy path:** Sender `POST`s a message → it's persisted and appears in
  their own thread immediately → the other participant, if connected to
  the thread, receives it over `duel-chat:<duelId>` within a couple
  seconds; if not connected, it's there on the next history load.
- **Failure case:** Message is empty/whitespace-only or exceeds the length
  cap → rejected client- and server-side; nothing is stored.

### S3 — Rate limiting

**As the** product, **I want** to cap how fast one user can send messages,
**so that** a single bad actor can't spam an opponent.

- **Happy path:** Sends under the limit succeed normally.
- **Failure case:** Sends over the limit return 429 with a retry-after; UI
  shows a "slow down" state rather than silently dropping the message.

### S4 — Block

**As a** harassment target, **I want** to block my opponent, **so that**
they can never message me again, in this thread or a future one.

- **Happy path:** User taps Block on the thread → a `DuelMessageBlock` row
  is created → future sends from the blocked party to the blocker, in any
  duel, are rejected server-side; the blocker's UI marks the thread closed.
- **Failure case:** The blocked user tries to send anyway (stale client) →
  server returns 403; the message is never persisted or delivered.

### S5 — Report

**As a** harassment target, **I want** to report a message or thread,
**so that** there's a record even without an admin UI yet.

- **Happy path:** User taps Report, optionally gives a reason → a
  `DuelMessageReport` row is captured (message, duel, reporter, reason);
  user gets a confirmation.
- **Failure case:** No admin triage loop exists yet (v1) → the report
  still succeeds and is stored; this gap is called out explicitly (see
  Open questions), not silently accepted as "handled."

### S6 — History and eligibility on completion

**As a** duelist, **I want** the thread to persist so I can scroll back
later, but **I don't want** a duel I didn't complete (voided/forfeited) to
expose messaging.

- **Happy path:** Re-opening `DuelRoomScreen` for a completed duel shows
  prior messages via `GET` history.
- **Failure case:** Duel is `pending`, `active`, or `voided` → messaging
  endpoints return 403/404 regardless of who asks.

---

## Acceptance criteria

**Eligibility**

- **AC-1.** Given a `Duel` with `status !== "completed"`, when either
  participant calls `GET`/`POST /api/duel/:id/messages`, then the API
  returns 403/404 (no thread exists).
- **AC-2.** Given a completed `Duel` where `player1_id` or `player2_id`
  starts with `guest:`, then no chat entry point renders in the mobile UI,
  and the API rejects sends from/to that guest identifier.
- **AC-3.** Given a completed, non-guest duel, when a non-participant
  authenticated user calls the messaging API for that `duel_id`, then the
  API returns 403.

**Send / receive**

- **AC-4.** Given a valid participant of a completed, non-guest duel, when
  they `POST` a non-empty message ≤ the length cap, then a `DuelMessage`
  row is created and a `duel-chat:<duelId>` Ably event is published
  server-side (never client-to-client).
- **AC-5.** Given a message body that is empty, whitespace-only, or over
  the cap, when `POST`ed, then the API returns 400 and nothing is
  persisted.
- **AC-6.** Given the recipient is subscribed to `duel-chat:<duelId>` at
  send time, then they receive the new message within a couple seconds
  without polling.
- **AC-7.** Given the recipient is not connected, when they next load the
  thread, then `GET` history returns the message in order (oldest→newest,
  stable pagination).

**Rate limiting**

- **AC-8.** Given a user has sent at/above the configured rate limit in
  the current window, when they `POST` again, then the API returns 429
  with a retry-after and does not persist the message.

**Block**

- **AC-9.** Given user A blocks user B, when B attempts to `POST` a
  message to any duel thread with A, then the API returns 403 and no
  message is persisted or delivered.
- **AC-10.** Given A has blocked B, when A views a prior thread with B,
  then A sees existing history (blocking is forward-only, not a
  redaction of the past) but cannot send further messages in it, and no
  new chat entry point is offered if a future duel between them completes
  while the block stands. (Matchmaking pairing is unaffected — see
  Out of scope.)

**Report**

- **AC-11.** Given a participant reports a message, when submitted, then a
  `DuelMessageReport` row is stored referencing the message, duel,
  reporter, and optional reason, and the reporter gets a success
  confirmation, independent of whether an admin UI exists.

**Auth / security**

- **AC-12.** Every messaging endpoint requires `requireAuth`; there is no
  guest-token path, unlike some existing duel routes.
- **AC-13.** `GET` history never creates rows as a side effect (no
  write-on-read), per `context/trust.md` #6.

---

## NFRs

- Delivery latency for a connected recipient: comfortably under a few
  seconds via Ably. History load: fast enough for a chat UI at a
  reasonable page size (e.g., 50 messages/page).
- No new runtime dependency; reuse the Ably capacity already provisioned
  for duels.
- Messages retained indefinitely in v1 (no auto-expiry) — flagged as an
  open question given the moderation/legal exposure of a real-money,
  stranger-messaging feature.

---

## Risks

- **Safety/product risk (primary).** This feature creates a 1:1 messaging
  surface between two strangers paired for stakes via matchmaking — a
  materially different risk profile from anything else in the app
  (harassment, unwanted contact, doxxing, scam solicitation for
  off-platform payment, and grooming risk if a minor slips past
  `age_confirmed_at`). Block + Report are mandatory v1 scope, but there is
  **no admin moderation loop** in v1. This should get explicit
  product/legal sign-off before implementation, not just an engineering
  go-ahead — see Open questions.
- A scoping bug in the Ably token route could leak a chat channel to a
  non-participant — architecture must show the same participant check
  `/api/realtime/token` already does, applied to the new capability too.
- Spam/abuse from a duel's loser (or winner) taking it out on the other
  side — rate limiting mitigates, does not eliminate.

---

## Edge cases (must handle)

- A completed duel later gets a rematch (`rematch_duel_id` set) — the
  original thread stays tied to the original `duel_id`; the rematch duel
  gets its own empty thread once it, too, completes.
- A participant's account is deleted/banned after messaging — sending to
  or fetching history involving a deleted `User` id must fail closed
  (403/404), never throw.
- A voided (forfeited) duel must never expose a thread, even if a message
  was somehow queued before voiding.
- Rapid double-tap send (duplicate `POST` of the same text) — client
  should debounce; the server is not required to dedup beyond that in v1
  (acceptable duplicate risk, not a correctness bug).

---

## Open questions (non-blocking for architecture, blocking for launch)

1. Does this need product/legal/trust-and-safety sign-off given the
   harassment/minor-safety surface? **Recommendation: yes, before
   implementation starts** (see Risks).
2. Retention policy for `DuelMessage` rows — indefinite, or auto-expire
   after N days?
3. Should messaging launch scoped to **friend-invited duels only**,
   excluding random-matchmaking opponents, to shrink the stranger-
   harassment surface for v1?
4. Is a push notification for new messages required for v1, or is
   in-app-only acceptable given no push infra exists yet?
5. Exact character cap and rate-limit window (this spec assumes 1000
   chars; sends/window TBD) — architect/product to set.

---

## Future

- Push notifications once infra exists.
- Automated content moderation (toxicity/profanity filters).
- Admin report-triage UI.
- Web (Next.js) parity.

---

## Traceability

AC-1…AC-13 map 1:1 to components in
`loop/architecture-post-challenge-messaging.md`.
