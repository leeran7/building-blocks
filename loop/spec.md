# Persistence and information architecture — The Climb / paid stacks

This is a **persistence / information-architecture spec** for an existing product
(building-blocks: paid stacks + The Climb). It is not a greenfield app spec and
does not choose a database, cache, ORM, or framework.

It decides what must be stored, what is ephemeral, what may be deleted, what is
irreversible, and which questions the data must answer — including user-visible
consequences on towers, record pages, the dashboard, refunds, and replays.

Engine formulas (growth, rate, ground, burial, price-to-rank) are unchanged.
This spec does not re-open them.

---

## Goal

Define a durable information model and testable rules so two products that share
one system of record stay consistent for the next several product generations:

1. **Paid stacks** — 74 category towers. Users pay to raise a listing’s
   **altitude** (metres). Live rank is **derived** (`ORDER BY altitude DESC` among
   the live set), never stored as current position. Each stack has a 90-day
   **season** whose `views_k` drives burial and price-per-metre.
2. **The Climb (free)** — one global endless-climber leaderboard. **Peak height
   is monotonic.** Signed-in runs that appear on the board are verifiable.
   Anonymous play stays allowed and unpersisted.

Success means: every traversal below can be answered from stored data (or is
explicitly Future); the 15 live schema/product defects in Scope are decided; a
qa-acceptance agent can mechanise every AC without taste.

---

## Scope

### In scope (now)

- System of record vs ephemeral store for listings, seasons, payments, climb
  records/runs, identity, view **credits**, and admin actions.
- Listing identity across season rollover.
- Publish rules (pending vs live), refund vs altitude, spend source of truth.
- Free-leaderboard trust boundary (how `peak_y` is obtained).
- Retention for climb runs, replay blobs, dead letters, inactive seasons,
  hidden listings.
- Account deletion vs financial retention.
- Category/stack slug rules on write (reject, never default).
- Information traversals listed below that are marked **now**.
- User-visible consequences of the above (towers, `/b/[slug]`, dashboard,
  refunds, replays, leaderboard).
- Contract status of unscoped `GET /api/tower`.

### Out of scope

- Choosing Postgres, Redis, Prisma, object storage, or any other technology
  (architect / data).
- Table schemas, indexes as DDL, ORMs, migrations.
- Gameplay: power-up one-slot vs stacking, simulation feel, audio, canvas.
- Engine constant retune (`G0`, `DOUBLE_EVERY_K`, `MAX_GROWTH`, …).
- Landing featured-grid cardinality and background token (existing surfaces;
  not this spec).
- Ranked-play *payouts* (no money on the free board).
- Per-category or seasonal **climb** boards.
- Click-through tracking (dropped as a product metric; see Future).
- Automatic season rollover (admin-manual now).
- A public “season standings” page (reconstruction is in scope; the page is
  Future).
- Conversion analytics warehouse, raw view logs, BI dashboards.
- Auth UI, Firebase project config, Stripe Dashboard payment-method set.

### Assumptions

- Firebase Auth remains the identity provider. Postgres (or successor SoR)
  stores an application user keyed by Firebase UID.
- Stripe Checkout + webhooks remain the payment rail. Credits gate on the
  provider’s `payment_status`, not merely event type.
- 74 paid stacks are a **code seed**, not a database taxonomy (existing AC-19).
- Redis (or successor cache) already holds rate limits, view session-dedup, IP
  caps, and the global view ceiling — and is **not** the system of record.
- Customer-facing copy remains: altitude is permanent; no consumer refunds;
  `/b/[slug]` is never deleted; anonymous free play has no login wall.
- Admin hide and admin refund already exist as privileged operations.
- Share-link replay (`/play?r=`) encodes the log in the URL today; that
  client-side path stays valid without a DB round-trip.

### Constraints (standing)

- **Reject, never default** category/stack slugs on write. No `@default("tech")`,
  no `DEFAULT_STACK_SLUG` substitution, no write-on-read that mints a season or
  listing from a public GET.
- **A monotonic write is a trust boundary.** Altitude and `peak_y` only increase
  (except where this spec explicitly says a field is *not* altitude — e.g. net
  spend after refund). Inputs that raise them must be server-derived or
  provider-attested.
- Rank is derived. There is no stored “current position” column.
- `spend` / cents paid is **never** a sort key for rank.
- Public GET paths do not create seasons, listings, or climb records.
- Middleware is presence-only; authorization lives in handlers.
- Secrets are never forwarded to URLs derived from the request.

### Decisions (the 15 live defects)

These are closed. They are not Open Questions.

| # | Defect | Decision |
|---|--------|----------|
| 1 | `blocks.clicks` has zero production incrementers; record pages show 0 | **Drop clicks as a product metric.** Do not display, increment, or require a click counter. Click-through is Future. |
| 2 | `@default("tech")` on listing/season category | **Forbidden.** Writes that omit or fail the paid-stack allow-list are rejected. Legacy leftover rows may still be *read* with a format-valid slug parser; new money cannot target them. |
| 3 | Globally unique listing slug vs season-history query | **Permanent listing identity + per-season participation.** Slug is globally unique and never recycled. Competitive altitude is per season so rollover is a fresh live board. `/b/[slug]` aggregates seasons. |
| 4 | `ClimbRecord.category_slug` collapsed to `free` | **One global free leaderboard, permanently.** Writers ignore client-supplied climb category. The partition key is frozen; per-category climb boards are Future and need a new spec. |
| 5 | `wins` incremented on any `finished: true` | **The metric is finishes, not first-place.** Count persisted runs with `finished = true`. First-place finishes are Future. |
| 6 | `spend_c` vs `SUM(payments)`; refund ignores both | **Payment ledger is source of truth.** Displayed spend is a defined sum of ledger rows. Admin refund marks rows refunded, **does not decrement altitude**, and **hides** the listing. |
| 7 | Checkout inserts listing before Stripe success | **Pending listings are not public.** Live towers and `/b/[slug]` 200 only after the first **paid** credit (or an admin/seed exception). Abandoned checkout must not publish altitude-0 listings. |
| 8 | Client-reported `peakY` + `Math.max` on a public board | **Trust boundary: server-derived `peak_y`.** Re-simulate from seed + input log. Client `peakY` is not persisted. A duration envelope is not verification. |
| 9 | `User.emailVerified` as a Firebase mirror | **Not a persistence SoR field.** Auth UI and access checks read Firebase. A cache column is optional and non-authoritative; no traversal depends on it. |
| 10 | `owner_email` client-supplied at checkout | **Authenticated owner required for new listings.** Email is derived from the verified user (token / users row), never from the client body. |
| 11 | `ClimbRun.userId` nullable; anonymous not persisted | **Keep anonymous play unsaved.** Persisted runs require a signed-in user with a provisioned users row (email present). `userId` on persisted runs is required. |
| 12 | Unbounded climb runs + 32 768-char replay tokens | **Retain personal-best evidence forever + 30 recent runs per user.** Older non-PB **replay blobs** expire at 90 days; run metadata may remain. Board peaks require durable seed + log. |
| 13 | No Category table | **Keep categories in code.** 74 stacks are product data. Adding a tower is a code change, not a migration (AC-19 preserved). |
| 14 | Rollover ignores `ends_at` | **Manual admin rollover** with precondition: `ends_at` in the past, unless an explicit logged `force` flag is sent. Idempotency key required. Live listings are not deleted. |
| 15 | `views_served` vs season `views_k` | **Both are product metrics.** `views_k` is the engine input (burial/price). `views_served` is per-listing above-ground impressions. They are not interchangeable. |

---

## Personas

### P1 — Listing owner (Maya)

Pays to put a URL on a paid stack. Uses checkout, the dashboard, and
`/b/[slug]`. Cares that paid metres show up, that rank/burial/competitor cost
are truthful, that abandoned checkout does not leak a listing, and that a
refund (if ops issues one) does not silently desync spend from the ledger.
Goal: her money and altitude are reconcilable; her record page outlives burial
and season rollover.

### P2 — Climber (Jordan)

Plays The Climb, optionally signed in. Wants a fair public leaderboard next to
the paid towers, a stable personal best, recent replays on the dashboard, and
share links that still work without an account. Goal: an honest peak cannot be
overwritten by a forged POST; anonymous play stays frictionless.

### P3 — Operator (Alex)

Admin token. Handles hide, exceptional refunds, season rollover, “I paid and
nothing happened,” and dead-lettered Stripe events. Goal: every privileged
write is durable and replayable; money events are never dropped because of a
4xx; the live board can be cleaned without deleting history.

---

## Information model (product entities, not tables)

Architect places these. Names below are product language.

### System of record (must survive Redis flush, deploy, and season rollover)

| Entity | What it is | Identity |
|--------|------------|----------|
| **User** | Application user | Firebase UID; email unique while the account exists |
| **SavedUrl** | Reusable listing URL for an owner | Unique per (user, url) |
| **Stack** | One of 74 paid towers | Slug in the **code seed**. Not a SoR table. |
| **Season** | 90-day inflation clock for one stack | `id`; at most one `is_active` per stack slug |
| **Listing** | Permanent public identity of a paid URL | Globally unique **slug**; `/b/{slug}` |
| **Participation** | That listing’s competitive state in **one** season | Unique `(listing, season)` |
| **Payment** | One credited Stripe session | Unique `stripe_session_id` |
| **PaymentDeadLetter** | Captured payment that could not be attributed | Replayable by `stripe_session_id` |
| **AdminAudit** | Privileged action (hide, refund, rollover, dead-letter replay) | Append-only; who / when / what / id |
| **ClimbRecord** | One user’s monotonic peak on the **single** free board | Unique per user |
| **ClimbRun** | One persisted signed-in run | id; always has `userId` |

### Ephemeral (may vanish on Redis flush)

- Rate-limit counters.
- View session-dedup windows (30 minutes).
- Per-IP view caps.
- Global qualified-view hourly ceiling remainder.
- HTTP cache (`s-maxage`) of tower payloads.
- In-flight Stripe Checkout session objects at the provider (provider-owned).

Flush consequence: some view credits may double-count until windows would have
expired. **Listings, altitudes, `views_k`, payments, peaks, and audits must
not.**

### Listing vs participation (defect 3)

- **Listing** holds: slug, url, display_name, owner user id (nullable after
  deletion), owner_email (billing/support copy), stack slug, `hidden_at`,
  `created_at`, `payment_state` (`pending` \| `paid`). Never deleted.
- **Participation** holds: season id, **altitude** (metres this season),
  spend-cents cache (non-authoritative), `views_served` this season,
  `peak_rank` this season (best/lowest 1-based live rank observed),
  `first_credited_at`. Frozen after that season is deactivated.
- **Live tower set** for stack S: participations in the **active** season of S,
  whose listing is `paid`, `hidden_at IS NULL`, and altitude is used only as
  the sort key. Buried vs visible is **derived** from altitude vs ground(`views_k`), not stored.
- After rollover: previous participations remain; they are **not** in the new
  live set until the owner pays in the new season (new participation starts at
  altitude 0, then additive metres from the new payment).
- All-time metres on the record page = sum of `metres_added` on credited
  payments for that listing (including refunded — those metres were granted).
- “Seasons appeared” = count of participations with at least one credited
  payment.

This matches “altitude is permanent” **within a season**, “new blocks start at
0” **on a new season’s live board**, and “record pages show all seasons.”

### Rank

- **Current rank** is 1-based position in the live tower set ordered by
  altitude DESC, then earlier `first_credited_at` for equal altitude.
- Never stored as current position.
- `peak_rank` on a participation may store the best observed live rank
  (updated only when the newly derived rank is strictly numerically smaller).

### Money

- **Ledger SoR** = Payment rows.
- A payment is credited only when the provider event is a crediting type **and**
  `payment_status` ∈ {`paid`, `no_payment_required`}.
- Metres added are computed **server-side at settlement** from live `views_k`
  (not client quote, not checkout-time rate except as audit metadata).
- Altitude increment is **additive** on the participation for the season being
  credited (the active season of the listing’s stack at settlement).
- Displayed **net spend** (dashboard and record page, same listing, same
  scope) = `SUM(amount_cents)` of credited payments for that listing with
  `refunded_at IS NULL`.
- Displayed **gross spend** = same sum including refunded rows.
- Record page shows net spend. If gross ≠ net, it also exposes refunded cents
  as a separate figure (not a silent mismatch with the dashboard).

### Climb

- **ClimbRecord.peak_y** raises only when a **server re-simulation** of
  (seed, input log) yields a higher peak. Client `peakY` is discarded.
- **peak_achieved_at** moves only when `peak_y` increases (tie-break).
- **finishes** increments when a persisted run has `finished = true`.
- **ClimbRun** stores seed, optional/required replay blob (required to raise
  the record or to occupy the board), peak from re-sim, finished flag, ticks.
- Anonymous POST: accepted, **not saved**.

---

## Traversal catalog

Hot = p95 path. Rare = support/admin. **Now** unless marked Future.

### Paid stacks

| # | Question | Actor | Heat | Now? |
|---|----------|-------|------|------|
| T1 | Ranked visible listings for one stack (≤100), with derived buried/amber/rank | Visitor | Hot | Yes |
| T2 | One listing by slug, including buried/hidden/past-season; HTTP 200; never delete | Visitor | Hot | Yes |
| T3 | All listings a user owns, with live rank, competitor cost, burial risk, payment history | Owner | Hot | Yes |
| T4 | Payments for one listing | Owner / Operator | Rare | Yes |
| T5 | Payment for one Stripe session (idempotency + support) | Operator | Rare | Yes |
| T6 | Dead-lettered captured payments, replayable by session id | Operator | Rare | Yes |
| T7 | Admin hide | Operator | Rare | Yes |
| T8 | Admin refund | Operator | Rare | Yes |
| T9 | Admin season rollover + audit | Operator | Rare | Yes |
| T10 | View credit: which season/stack was incremented; listing `views_served` if above ground | System | Hot | Yes |
| T11 | This listing in season N (altitude, spend, peak_rank that season) | Visitor / Owner | Rare | Yes |
| T12 | “This customer paid; why isn’t altitude up?” | Operator | Rare | Yes |
| T13 | Season-end snapshot table / public standings page | Visitor | — | **Future** (reconstruct T11 from frozen participations + frozen `views_k` now) |
| T14 | Click-through counts to listing URL | Visitor | — | **Future** (clicks dropped now) |

### Free climb

| # | Question | Actor | Heat | Now? |
|---|----------|-------|------|------|
| T15 | Top N by `peak_y` (landing + category pages show the **same global** board) | Visitor / Climber | Hot | Yes |
| T16 | One user’s standing (peak, rank, finishes) | Climber | Hot | Yes |
| T17 | One user’s recent runs + replay playback | Climber | Hot | Yes |
| T18 | Replay by share token (URL-encoded log; no SoR required) | Visitor | Hot | Yes |
| T19 | Re-sim from (seed, input log) → server peak for any run that can appear on the board | System | Hot on persist | Yes |
| T20 | Which run produced this peak? (dispute) | Operator / Climber | Rare | Yes |
| T21 | Per-category or seasonal climb boards | Climber | — | **Future** (would need a new partition key; do not reuse `category_slug` casually) |

### Identity / privacy

| # | Question | Actor | Heat | Now? |
|---|----------|-------|------|------|
| T22 | User by Firebase UID; email unique; display name for handles | System | Hot | Yes |
| T23 | Saved URLs per user | Owner | Hot | Yes |
| T24 | Account deletion: cascade vs retain for money/audit | Owner | Rare | Yes |
| T25 | PII inventory: email, display_name, listing URLs, owner_email | Operator | Rare | Yes |

### Analytics / ops

| # | Question | Actor | Heat | Now? |
|---|----------|-------|------|------|
| T26 | Dead-letter volume by day/reason | Operator | Rare | Yes (query dead-letter rows) |
| T27 | Checkout started vs paid (conversion) | Operator | — | **Future** (needs checkout-attempt records) |
| T28 | Burial rate, spend vs altitude cohorts | Operator | — | **Future** |
| T29 | Climb run volume, replay storage bytes | Operator | — | **Future** (ops metric; retention caps bytes now) |

Unscoped `GET /api/tower` is **not** T1. T1 is per-stack. See AC-4.

---

## Stories

Each story has a happy path, a failure case, and ACs in the next section.

### S1 — Ranked live stack (T1)

**As a** visitor, **I want** the live listings for one paid stack ordered by
altitude, **so that** I can see who is #1 without a stored rank column.

- Happy: GET for an allow-listed stack returns ≤100 `paid`, non-hidden
  current-season participations, altitude DESC, derived rank/buried/amber.
- Failure: unknown stack slug → not found; no season/listing created.

### S2 — Permanent record page (T2, T11, clicks)

**As a** visitor, **I want** `/b/{slug}` to load for buried, hidden, and
past-season listings, **so that** public records are stable URLs.

- Happy: paid listing returns 200 with altitude (current season and all-time
  metres), net spend from the ledger, seasons-appeared ≥ 1, no clicks field.
- Failure: unknown slug or still-pending listing → 404. Hidden still 200.

### S3 — Owner dashboard (T3, T4)

**As a** listing owner, **I want** every listing I own with live rank,
competitor cost, burial risk, and payment history, **so that** I can decide
whether to top up.

- Happy: signed-in GET returns those fields; spend matches ledger net spend
  for each listing.
- Failure: unauthenticated → 401. Rank is null when the listing is pending,
  hidden, or not in the live set (not a fake rank inside a truncated window
  presented as global).

### S4 — Publish only after paid (T1, T2, defect 7)

**As a** listing owner, **I want** checkout not to publish me at altitude 0 if
I abandon Stripe, **so that** stacks are not spam surfaces.

- Happy: after `payment_status` paid, listing becomes `paid`, participation
  altitude increases by server-computed metres, record page 200.
- Failure: abandoned/unpaid session: not in live tower; `/b/{slug}` 404 (or
  equivalent “does not exist publicly”).

### S5 — Payment credit and idempotency (T5, T12)

**As an** operator (and as Maya, indirectly), **I want** a paid Stripe session
to credit altitude exactly once, **so that** double-webhooks and unpaid
async methods cannot mint metres.

- Happy: paid crediting event → payment row + additive altitude + net spend
  increases by `amount_cents`.
- Failure: duplicate `stripe_session_id` → no second increment. Unpaid
  `payment_status` → no credit. Unattributable captured payment → dead letter
  + ack 2xx.

### S6 — Dead-letter replay (T6, T12)

**As an** operator, **I want** to replay a dead-lettered session by Stripe
session id, **so that** a captured payment still becomes altitude after a
deterministic miss.

- Happy: replay attributes, writes payment, increments altitude, records
  audit; subsequent replay is idempotent.
- Failure: unknown session → 404; already credited → no double metres.

### S7 — Admin hide (T7)

**As an** operator, **I want** to hide a listing from live towers, **so that**
abuse can be removed without deleting the record.

- Happy: `hidden_at` set; listing drops out of T1; `/b/{slug}` still 200 with
  hidden true; audit row written.
- Failure: missing admin auth → 401/403; unknown id → 404; hide is not a
  delete.

### S8 — Admin refund (T8)

**As an** operator, **I want** to refund Stripe charges for a listing without
rewriting altitude history, **so that** chargebacks/legal exceptions are
possible while “altitude is permanent” stays true.

- Happy: all not-yet-refunded payments get `refunded_at`; Stripe refund
  attempted; listing hidden; altitude unchanged; net spend drops; audit written.
- Failure: customer checkout still discloses no refunds. Second admin refund
  does not create duplicate Stripe refunds for already-refunded rows. Altitude
  does not decrease.

### S9 — Season rollover (T9, T11)

**As an** operator, **I want** to close a stack’s season when it has ended,
**so that** `views_k` and rate reset without destroying listings.

- Happy: after `ends_at`, rollover deactivates the season (frozen `views_k` and
  participations), creates a new 90-day active season at `views_k = 0`,
  listings persist, live tower of the new season is empty until new payments,
  audit written.
- Failure: rollover before `ends_at` without `force` → rejected. Missing
  category → rejected (no default stack). Repeat with same idempotency key →
  no second season.

### S10 — View credit (T10)

**As a** visitor (indirectly), **I want** qualified views to raise the correct
stack’s `views_k` and increment `views_served` only for above-ground live
listings, **so that** burial and price stay honest.

- Happy: qualified view on stack S increments that season’s `views_k` by
  0.001 and `views_served` on live non-hidden listings with altitude ≥ ground.
- Failure: bot / session-dup / IP cap / ceiling → no credit. Homepage or climb
  does not credit a stack. Public view does not create a season. Dedup keys
  are per-stack (visiting two stacks can credit both, subject to the global
  hourly ceiling).

### S11 — Verified climb persist (T19, T20)

**As a** climber, **I want** my signed-in peak to be whatever the server
simulates from my seed and input log, **so that** the public board next to
paid stacks cannot be stolen with a JSON body.

- Happy: valid token + seed + log → server peak persisted; if higher than
  prior, `peak_y` and `peak_achieved_at` update; run stored with that peak;
  the run id of the current peak is retrievable.
- Failure: anonymous or no email → `saved: false`, no SoR write. Missing/invalid
  log → no persist, peak unchanged. Client `peakY` larger than re-sim → ignored
  (stored peak is re-sim, not client). Implausible log that fails re-sim →
  reject persist.

### S12 — Free leaderboard and standing (T15, T16)

**As a** climber, **I want** top N and my standing on one global board,
**so that** landing and stack pages do not imply per-category climb ranks.

- Happy: top N is `peak_y` DESC, then `peak_achieved_at` ASC; finishes shown;
  handles from display_name else a non-email pseudonym.
- Failure: client `categorySlug` does not create a second board. Ties: later
  equal peak does not outrank the earlier achiever. Updating a non-improving
  run does not change `peak_achieved_at`.

### S13 — Run history, replay, retention (T17, T18)

**As a** climber, **I want** my last 30 runs and my personal-best evidence
kept, **so that** dashboard replay and disputes work without unbounded blobs.

- Happy: dashboard lists ≤30 recent persisted runs with replay when blob
  present; PB run’s seed+log remain even if older than 30; `/play?r=` still
  plays a URL-encoded log without a DB hit.
- Failure: anonymous history empty. Replay blob longer than 32 768 characters
  rejected. Non-PB blobs older than 90 days are not required to play back
  from the SoR.

### S14 — Identity, owner email, deletion (T22–T25)

**As a** listing owner, **I want** my account and PII handled explicitly,
**so that** listings and payments survive me but my login does not.

- Happy: new listing owner_email = users.email from verified token; saved URLs
  round-trip; delete account removes user, saved URLs, climb records/runs,
  display_name; listings remain with `userId` null; payments remain.
- Failure: client `owner_email` different from token email is ignored/rejected.
  Delete does not delete payment rows or listing rows. Email is not shown as
  a climber handle.

---

## ACs

Format: Given / When / Then. Numbered AC-1…. Negative ACs are included on every
critical flow. qa-acceptance must invoke behaviour (or HTTP/DB fixtures), not
grep source.

### S1 — Ranked live stack

**AC-1.** Given an allow-listed paid-stack slug with an active season and K
live listings (paid, not hidden, current-season participation), When an
unauthenticated client requests that stack’s ranked listings, Then the
response contains at most 100 listings, ordered by altitude descending
(equal altitude: earlier `first_credited_at` first), each with a 1-based
`rank` equal to its position in that list, and **no** field used as a sort
key other than altitude (and that tie-break). `spend` / `spend_c` is absent
from the ordering.

**AC-2.** Given a live listing whose altitude is below ground(`views_k`) and
another above, When the ranked list is returned, Then both may appear in the
capped list (burial is not deletion), the buried flag is true only for
altitude < ground, and `amber_edge` is derived — neither flag is stored as
source of truth.

**AC-3.** Given a slug that is not in the paid-stack code seed, When a client
requests ranked listings for that slug, Then the response is 404 with
`code=INVALID_CATEGORY`, and the number of Season rows and Listing rows is
unchanged.

**AC-4.** Given two stacks with different `views_k` and different #1
altitudes, When a client calls an **unscoped** tower endpoint (no stack
slug), Then the response is **not** a supported leaderboard: it must not
present a single `season`, `engine`, or `cost_of_rank1_usd` as if they were
global. Ranked product reads use the per-stack contract only. (The unscoped
path may 404 or return a non-leaderboard payload; it must not mint seasons.)

### S2 — Permanent record page

**AC-5.** Given a listing that has received at least one credited payment,
When a client GET `/b/{slug}` (or the record API equivalent) in each of the
states {above ground, buried, hidden, season no longer active}, Then HTTP
status is 200 and the listing is not removed from the SoR.

**AC-6.** Given no listing with slug X, or a listing X that is still
`pending` with zero credited payments, When a client GET `/b/X`, Then HTTP
status is 404.

**AC-7.** Given a listing with credited payments in N distinct seasons
(N ≥ 2), When the record page is rendered, Then “seasons appeared” equals N,
and the page can show altitude for a named past season (T11), not only
all-time metres.

**AC-8.** Given any record page for a paid listing, When stats are shown,
Then there is **no** clicks count (zero or otherwise). `views_served` may be
shown. Net spend equals `SUM(amount_cents)` of that listing’s payments with
`refunded_at` null (same formula as AC-10).

### S3 — Owner dashboard

**AC-9.** Given a signed-in user who owns at least one `paid` listing in a
live set of size ≤ 100, When they GET the dashboard, Then each such listing
includes: derived live rank, altitude of the listing immediately above (or
null if #1), competitor cost in USD to overtake that listing (or null if
#1), burial-risk days or null when never-buried, and the payment list from
the ledger.

**AC-10.** Given the same listing, When dashboard net spend and record-page
net spend are read in the same second with no concurrent writes, Then the
two integers (cents) are equal.

**AC-11.** Given no valid auth token, When a client GET the dashboard, Then
the response is 401 and no listing payload is returned.

**AC-12.** Given an owned listing that is `pending`, hidden, or not in the
current-season live set, When the dashboard is returned, Then `rank` is
null (not a position inside an unrelated or truncated array).

### S4 — Publish only after paid

**AC-13.** Given a signed-in user with a verified email and a body that names
an allow-listed stack, a valid URL, a sanitised display name, and an amount
≥ minimum entry, When they start checkout, Then a listing may be stored as
`pending` bound to that user, and that listing’s slug does **not** appear in
the live ranked set.

**AC-14.** Given a `pending` listing whose Stripe session is abandoned or
completes with `payment_status` not in {`paid`, `no_payment_required`}, When
the live ranked set and `/b/{slug}` are read, Then the listing is absent from
the live set and `/b/{slug}` is 404.

**AC-15.** Given a `pending` listing, When a crediting event with paid status
arrives for its Stripe session, Then the listing’s `payment_state` becomes
`paid`, a participation in the active season exists with altitude increased
additively by server-computed metres, and `/b/{slug}` returns 200.

**AC-16.** Given a checkout body for a new listing with no auth token, When
the request is processed, Then the response is 401 and no listing is
created.

### S5 — Payment credit and idempotency

**AC-17.** Given a live `paid` listing and an unused `stripe_session_id`, When
a signed crediting event with `payment_status=paid` and positive
`amount_cents` is processed, Then exactly one Payment row exists for that
session, participation altitude increases by `computeMetres(amount, live
views_k)` (not by a client-supplied metres field), and net spend increases by
`amount_cents`. If the checkout or webhook body includes client-supplied
`rate`, `metres`, or `growth`, those fields are ignored or the request is
400; metres come only from the server engine at settlement.

**AC-18.** Given AC-17 already applied for session S, When the same crediting
event is delivered again, Then altitude and payment count are unchanged
(idempotent on `stripe_session_id`).

**AC-19.** Given a `checkout.session.completed` event with
`payment_status=unpaid`, When it is processed, Then no Payment row is
inserted, altitude is unchanged, and the handler acknowledges without
dead-lettering (async success may credit later).

**AC-20.** Given a signed crediting event with paid status that cannot be
attributed (missing session id, missing listing id, invalid amount), When it
is processed, Then a PaymentDeadLetter row is stored with
`stripe_session_id`, reason, amount, and event type; the HTTP response to the
provider is 2xx; altitude is unchanged.

### S6 — Dead-letter replay

**AC-21.** Given a dead-letter row for session S whose listing now exists and
is attributable, When an admin replays S, Then a Payment row is inserted
(if not already), altitude increases once by the settlement metres, an
AdminAudit row is written, and the dead-letter is marked replayed (or
deleted per architect, but S must not remain “open”).

**AC-22.** Given session S already has a Payment row, When an admin replays S
from the dead-letter queue, Then altitude does not increase a second time
and the response indicates already credited.

### S7 — Admin hide

**AC-23.** Given a `paid` non-hidden listing in the live set, When an admin
with a valid admin credential hides it, Then `hidden_at` is a non-null
timestamp, the listing is absent from T1, `/b/{slug}` is 200 with hidden
true, and an AdminAudit row records actor, action=`hide`, listing id, time.

**AC-24.** Given no admin credential (or a wrong one), When hide is called,
Then status is 401 or 403 and `hidden_at` is unchanged.

**AC-25.** Given a hide of listing L, When L is loaded from the SoR by slug,
Then the row still exists (hide ≠ delete).

### S8 — Admin refund

**AC-26.** Given a listing with one or more credited, not-yet-refunded
payments and altitude A, When an admin refund runs, Then: Stripe refund is
attempted for each such payment; each such payment has `refunded_at` set;
listing is hidden (AC-23 effects); participation altitude is still A; net
spend excludes those amounts; AdminAudit action=`refund` includes cents
attempted.

**AC-27.** Given all payments on listing L already have `refunded_at`, When
admin refund is called again, Then no additional Stripe refund is created
for those rows, altitude is unchanged, and the handler is not a 500.

**AC-28.** Given a customer Checkout session for altitude, When the session
is created, Then the customer-visible submit copy includes that altitude is
permanent and there are no consumer refunds. (Admin AC-26 is exceptional and
does not appear as a customer self-serve.)

**AC-29.** Given any refund path, When altitude is read before and after,
Then altitude is not lower. No product path SET-decrements altitude.

### S9 — Season rollover

**AC-30.** Given stack S with active season Z, `ends_at` < now, and at least
one live participation, When an admin rollover runs with a unique
idempotency key and category=S (allow-listed), Then: Z.`is_active` is false;
Z.`views_k` is unchanged thereafter; Z’s participations are not updated by
later payments; a new active season Z' exists for S with `views_k = 0` and
`ends_at` ≈ now + 90 days; listing slugs still resolve (AC-5); the live set
for S is empty until a new paid credit in Z'; AdminAudit action=`rollover`.

**AC-31.** Given active season Z with `ends_at` in the future, When rollover
is called without `force=true`, Then Z remains active, no Z' is created, and
the response is 409 (or 400) with a machine-readable code. Given a rollover
request with missing/unknown category, When it is processed, Then no season
is created and the slug is not substituted with `tech` or
`DEFAULT_STACK_SLUG`.

**AC-32.** Given AC-31’s season (`ends_at` in the future), When rollover is
called with `force=true` and a valid admin credential and an allow-listed
category, Then AC-30 effects occur and the audit includes `force=true`.

**AC-33.** Given AC-30 succeeded with idempotency key K, When the same admin
call is repeated with K, Then no additional season row is created.

### S10 — View credit

**AC-34.** Given an active season for allow-listed stack S and a qualified
view attributed to S, When the view pipeline succeeds, Then that season’s
`views_k` increases by 0.001 (1 view = 0.001k) and no other stack’s
`views_k` changes. Given a homepage or climb page view with no allow-listed
stack, When the pipeline runs, Then `views_k` is unchanged and no season is
created. Given a stack with no active season, When a view is attributed,
Then skip (no create).

**AC-35.** Given the same session id already credited for stack S inside the
30-minute dedup window, When another view for S arrives, Then `views_k` is
unchanged. When a view for **different** allow-listed stack T arrives from
the same session, Then T **may** be credited (dedup key includes the stack),
subject to AC-37.

**AC-36.** Given a credited view and live listings on S, When `views_served`
is updated, Then it increments only for listings in the live set with
`altitude >= ground(views_k)` and `hidden_at` null. Buried or hidden
listings do not increment. Season `views_k` still increments on qualified
credit even if every listing is buried.

**AC-37.** Given the global hourly qualified-view ceiling (40 000) is
exhausted, When further views arrive, Then no stack’s `views_k` increases
until the window resets. Per-IP cap remains 20 qualified views per hour
**per stack**.

### S11 — Verified climb persist

Five ACs: this is the trust-boundary flow (anonymous, missing log, and
client-ceiling negatives). Do not drop AC-42; a duration envelope is not
verification.

**AC-38.** Given a valid Firebase token with email, a seed, and an input log
(replay token or equivalent) that the official simulation can execute, When
POST climb result runs, Then the stored run’s `peak_y` equals the
**server-simulated** peak, `ClimbRecord.peak_y` becomes
`max(prior, simulated)`, and the client’s `peakY` field is not written
anywhere as SoR.

**AC-39.** Given AC-38, When the simulated peak is **lower** than the prior
record, Then `ClimbRecord.peak_y` and `peak_achieved_at` are unchanged and
the run is still stored with the simulated peak.

**AC-40.** Given a POST with a valid token but no usable input log, or a log
that fails decode/re-sim, When it is processed, Then no `ClimbRecord`
mutation occurs, no run is required to be stored, and the response is 4xx
(or `saved: false` with a stable `code` that tests can assert — not 200
`saved: true`).

**AC-41.** Given no token, or a token without email, When POST climb result
runs with any body, Then HTTP 200 with `saved: false`, and zero new
ClimbRun / ClimbRecord rows. (Anonymous play remains allowed.)

**AC-42.** Given a client `peakY` larger than the re-sim peak (including a
value at the duration-envelope ceiling), When POST is processed with a
valid log, Then the record equals the re-sim peak, not the client value.

### S12 — Free leaderboard and standing

**AC-43.** Given at least N signed-in climbers with records, When top N is
read from the landing or any paid-stack page, Then the list is the same
global board: ordered by `peak_y` DESC, then `peak_achieved_at` ASC, and
`categorySlug` in the request does not partition it.

**AC-44.** Given two users with equal `peak_y`, When ranks are derived, Then
the user with the earlier `peak_achieved_at` has the better (smaller) rank.
A later non-improving persist does not move `peak_achieved_at`.

**AC-45.** Given a signed-in user with a record, When standing is read, Then
it includes `peak_y`, 1-based rank consistent with AC-43/AC-44, `finishes`
= count of that user’s persisted runs with `finished=true`, and a handle
that is not the user’s email.

**AC-46.** Given `finished=true` on a persist that is not rank #1 at that
moment, When `finishes` is read, Then it has incremented by 1. The product
label is finishes (or equivalent), not “wins” / first-place.

### S13 — Run history, replay, retention

**AC-47.** Given a signed-in user with R persisted runs, When the dashboard
replay list is read, Then it contains `min(R, 30)` runs, newest first, each
with peak and created time.

**AC-48.** Given a user whose personal-best run is older than the 30 newest,
When the PB evidence is requested (dispute T20 or re-verify), Then seed and
input log for **that** run are still available.

**AC-49.** Given a share URL `/play?r={token}` with a well-formed encoded
log, When a visitor (including anonymous) opens it, Then the client can
replay without a SoR read. Given a persist with replay token length >
32 768, When POST runs, Then the token is rejected (AC-40).

**AC-50.** Given a non-PB run whose replay blob is older than 90 days, When
retention has run, Then the blob may be absent while the run metadata
(peak, seed, timestamps, finished) may remain. The PB blob is not absent
solely due to age.

### S14 — Identity, owner email, deletion

**AC-51.** Given a signed-in user whose token email is E, When they create a
new listing, Then stored `owner_email` equals E. A client body
`owner_email` ≠ E does not win (ignored or 400). Top-up of an existing
`paid` listing may remain unauthenticated and must not change owner.

**AC-52.** Given Firebase as identity SoR, When an auth surface checks
“email verified”, Then it does not require a Postgres `emailVerified`
column to be true. Absence or staleness of such a column does not block
sign-in.

**AC-53.** Given a user with saved URLs, listings, payments, and climb data,
When they delete their account, Then: the users row is gone; SavedUrl rows
are gone; ClimbRecord and ClimbRun rows are gone; Listing rows remain with
`userId` null and slug unchanged; Payment rows remain; `owner_email` on
listings/payments is retained for audit; display_name on the user is gone;
climber handle is no longer on the free board.

**AC-54.** Given AC-53, When the live tower is read, Then the orphaned
`paid` non-hidden listing still ranks by altitude (ownership deletion does
not hide or delete it).

### Cross-cutting: category writes and monotonicity

**AC-55.** Given any write that stores a paid-stack category (listing,
season, payment metadata, view credit), When the slug is missing, `tech`,
or not in the code seed, Then the write is rejected. No stored category
equals a substituted default.

**AC-56.** Given Redis is flushed, When listings, seasons (`views_k`),
payments, climb records, participations, and admin audits are read, Then
they still exist. Rate limits and view-dedup windows may reset.

**AC-57.** Given a new tower slug added only in the code seed (no SoR
migration), When ranked GET is called for that slug, Then the response is
the empty live set (or 200 with zero listings), not 500, and no Category
table row is required.

---

## NFRs

### System of record vs ephemeral

| Data | Class | Survive Redis flush | Survive deploy | Survive rollover |
|------|-------|---------------------|----------------|------------------|
| Listings, slugs, URLs, hidden_at | SoR | Yes | Yes | Yes (not deleted) |
| Participations / seasonal altitude | SoR | Yes | Yes | Frozen for old season; new season empty |
| Season `views_k`, starts_at, ends_at | SoR | Yes | Yes | Old frozen; new at 0 |
| Payments, dead letters, admin audit | SoR | Yes | Yes | Yes |
| ClimbRecord, ClimbRun metadata, PB log | SoR | Yes | Yes | Yes (climb is not seasonal) |
| Rate limits, view dedup, IP caps, hourly ceiling | Ephemeral | No | N/A | N/A |
| Tower HTTP cache | Ephemeral | No | No | No |

### Irreversibility

- **Altitude** (participation metres) never decreases. Refunds do not lower it.
- **ClimbRecord.peak_y** never decreases.
- **Listing slug** is never recycled; listings are never deleted.
- **Payment** rows are never deleted; refunds are a state on the row.
- **AdminAudit** is append-only.
- Money **credits** (metres_added on a payment) are not rewritten; a
  compensating refund flag is used instead.

### Retention

| Data | Retention |
|------|-----------|
| Listings (including hidden) | Indefinite; never delete |
| Inactive seasons + frozen participations | Indefinite (powers T11) |
| Payments (including refunded) | Indefinite (financial / support) |
| Dead letters | Until replayed, then ≥ 90 days; if never replayed, ≥ 2 years |
| Admin audit | Indefinite |
| ClimbRun metadata | Indefinite while the user exists; gone on account deletion |
| Replay blobs | PB: while the peak remains on the board or the user exists. Non-PB: 30 newest per user, otherwise expire blobs at 90 days |
| Pending listings with no credit | May be purged after 7 days |
| Users / saved URLs / climb records | Until account deletion |
| View raw logs | Not stored now (Future) |
| Redis dedup keys | TTL of their window (30 min session; 1 hour caps) |

### Scale envelope (design for; not current traffic)

| Quantity | Order of magnitude |
|----------|-------------------|
| Paid stacks | 74 (fixed product data) |
| Users | 10^5 |
| Listings (lifetime, never deleted) | 10^5 |
| Live listings returned per stack hot path | cap **100** (product page size) |
| Participations (listings × seasons) | 10^6 |
| Credited views | ceiling 4×10^4 / hour global |
| Payments | 10^3 / day; 10^6 lifetime |
| Dead letters | ≪ payments; 10^4 lifetime |
| Climb persist attempts | 10^5 / day (signed-in subset) |
| ClimbRecords | ≤ number of users (one global board) |
| ClimbRuns stored | ~30 metadata rows/user typical; 10^7 lifetime metadata |
| Replay blob size | ≤ 32 768 bytes each; worst-case ~31 blobs/user (30 + PB) ≈ 1 MiB/user; 10^5 users → ~100 GiB upper bound before expiry |

### Latency

| Path | Budget |
|------|--------|
| Ranked stack GET, cache hit (`s-maxage=3` or equivalent) | p95 ≤ 200 ms |
| Ranked stack GET, cache miss, ≤100 rows | p95 ≤ 500 ms |
| Record page GET | p95 ≤ 500 ms |
| Dashboard GET (≤ 20 owned listings) | p95 ≤ 800 ms |
| View credit write | p95 ≤ 300 ms after Redis checks |
| Payment webhook credit | p95 ≤ 1 s excluding Stripe RTT |
| Climb persist including re-sim of ≤ 18 000 ticks | p95 ≤ 2 s; if exceeded, fail the persist (do not skip re-sim) |

### AuthZ / abuse

- New listing checkout: authenticated; user provisioned with email.
- Top-up of existing `paid` listing: may be unauthenticated; rate-limited
  (30 / 60 s / uid-or-ip, fail-open on cache outage so sales are not blocked).
- Climb persist: optional auth; unauthenticated never writes SoR; 60 / 60 s / IP
  on the POST, fail-open so play is not blocked.
- Admin hide/refund/rollover/dead-letter replay: admin bearer, constant-time
  compare, same rate limiter family as existing privileged routes.
- Webhook: signature verified before any SoR write.
- Climb re-sim is the authorization for `peak_y`, not the Firebase token
  alone.

### Accessibility (user-visible surfaces touched by this spec)

Record page, dashboard, and free leaderboard remain **WCAG 2.1 AA**. Hidden
and buried states must be available as text, not colour alone. This spec does
not change design tokens (`void` `#0a0a0c`).

### Cache

Per-stack ranked payloads may be cached ≤ 3 s (`s-maxage=3`,
stale-while-revalidate acceptable). Cache must be partitioned by stack slug
(NFR: a partitioned resource cannot keep a single global aggregate).

---

## Risks

| ID | Risk | Impact | Mitigation in this spec |
|----|------|--------|-------------------------|
| R1 | Free leaderboard displayed beside paid stacks with client scores | Reputation / implied paid integrity | AC-38–AC-42: server re-sim required |
| R2 | Re-sim of 18 k ticks blows the persist SLA | 429/timeouts, players not saved | 2 s budget; fail closed on persist; architect may bound tick CPU |
| R3 | Pending listings + webhook missing id | Captured money, no altitude | Dead letter + 2xx (AC-20); replay (AC-21); prefer pending row so `block_id` exists |
| R4 | Admin refund vs “no refunds” copy | Legal / support confusion | Customer copy stays no-refunds (AC-28); admin path hides listing, never drops altitude (AC-26, AC-29) |
| R5 | Seasonal altitude vs “altitude is permanent” copy | User expects old metres on the new live board | Record page keeps all-time metres + per-season (AC-7); live board is current participation only |
| R6 | Redis flush double-counts views | Burial/price jump | Accepted bounded error; `views_k` itself is SoR (AC-56) |
| R7 | Legacy `tech` / broad-family seasons in leftover rows | Ghost stacks / invisible money | New writes reject (AC-55); leftover reads may use format parser only |
| R8 | Account deletion vs payment audit / GDPR | Legal | Payments and listings retained; login PII removed (AC-53) |
| R9 | Unscoped `/api/tower` still consumed by OG/clients | Broken contracts | AC-4: not a leaderboard; architect versions or 404s |
| R10 | Replay blobs ~100 GiB if retention ignored | Cost | 30 + PB + 90-day blob expiry (AC-47–AC-50) |
| R11 | Write-on-read `getOrCreate` on public GET | Ghost seasons | AC-3, AC-34; create only on authenticated/admin/payment writes |
| R12 | Stripe 4xx drops captured funds | Money loss | Dead-letter + 2xx (existing trust.md; AC-20) |
| R13 | `spend_c` cache drifts from ledger | Dashboard ≠ record page | Ledger SoR; AC-10 |
| R14 | Force rollover used casually | Surprise empty boards | AC-31 default deny; force audited (AC-32) |
| R15 | Top-up without auth after owner deletion | Orphan listing still payable | Allowed (FAQ); owner fields unchanged (AC-51, AC-54) |

Third parties: Stripe (payments, refunds, webhooks), Firebase Auth, cache
provider, hosting. Missing assets: none required for persistence. Unstable
rules: none left in Open Questions for this domain; engine constants remain
env-overridable as today.

---

## Open Questions

None for this domain. The following were decided from existing ACs, FAQ,
trust.md, and the live defects list:

- Free leaderboard **is** a trust boundary → server-derived peaks.
- Unscoped `/api/tower` **is not** a ranked contract → AC-4.
- Power-up one-slot vs stacking is **gameplay**, not persistence → Out of
  scope / Future (gameplay).
- Clicks, category defaults, listing identity, wins vs finishes, spend SoR,
  unpaid publish, emailVerified, owner_email, anonymous runs, replay
  retention, Category table, rollover gate, dual view metrics → Decisions
  table.

If legal counsel later requires a maximum payment-retention period shorter
than “indefinite,” that is a compliance change, not an architect guess.

---

## Future

Gold-plating and later generations. Do not build now. Data you would need:

- **Click-through (T14):** HTTP redirect or beacon through a first-party
  path that increments a counter **after** this ships as a real feature.
  Store: listing id, time, (optional) session. Until then, no clicks field.
- **Season standings page (T13):** public URL of frozen participations
  ordered as at close, plus frozen `views_k` / ground. Optional snapshot
  table only if we must freeze derived burial flags independently of later
  hides. Reconstruction from frozen participations is enough to start.
- **Checkout conversion (T27):** checkout-attempt records (session id,
  user, listing, amount, created_at, outcome). Not required for credit
  integrity (webhook + pending listing suffice).
- **Burial / spend cohorts (T28):** warehouse export of payments ×
  participations; not SoR.
- **Climb volume / blob bytes (T29):** ops gauges on retained blob count
  and bytes.
- **Per-category or seasonal climb boards (T21):** new partition key,
  explicit product spec; **do not** revive `category_slug` by writing
  client slugs again. Keep seed + log per board-eligible run.
- **First-place “wins”:** needs rank-at-finish or a snapshot; until then
  finishes only.
- **Automatic rollover:** scheduler when `ends_at` passes; still needs
  idempotency and the same freeze rules.
- **Anonymous persisted runs:** would need a stable anonymous id, privacy
  policy, and a retention class; rejected now.
- **Raw view log:** needed for forensic over-count after Redis flush;
  expensive; rejected now.
- **Gameplay:** power-up stacking vs one-slot; not a persistence decision.
- **Landing spec rewrite:** featured grid uses
  `FEATURED_GAME_CATEGORIES.length` (currently 7 family reps; live directory
  may show 9 default visible stacks) and background `void` `#0a0a0c` — not
  part of this persistence spec.

---

## Appendix — mapping to current live fields (informative)

For implementer/architect orientation only. Not a schema.

| Live field | Fate under this spec |
|------------|----------------------|
| `Block.slug` unique | Keep as **Listing** identity |
| `Block.season_id` as “the” season | Replace with Participation `(listing, season)` |
| `Block.altitude` | Move to **current** participation; all-time metres = sum(payments.metres_added) |
| `Block.spend_c` | Optional cache; ledger is SoR |
| `Block.clicks` | Drop from product |
| `Block.views_served` | Keep, per participation (season) |
| `Block.peak_rank` | Keep, per participation |
| `Block.category` default `"tech"` | Remove default; allow-list only |
| `Season.category` default `"tech"` | Remove default; allow-list on create |
| `ClimbRecord.category_slug` | Frozen global board; ignore client |
| `ClimbRecord.wins` | Treat as **finishes** |
| `ClimbRun.userId` null | Persisted runs require userId |
| `ClimbRun.replay_token` | PB + 30 recent; 90-day expiry for the rest |
| `User.emailVerified` | Optional non-SoR mirror |
| `Payment.stripe_session_id` unique | Keep as idempotency key |
| `PaymentDeadLetter` | Keep; add replay + audit |
| Rank column | Still forbidden |
| Categories table | Still forbidden |
)
