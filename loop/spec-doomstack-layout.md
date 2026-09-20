# Spec: Doomstack layout pass — hub / 1v1 / leaderboard / daily

**Product:** Doomstack (building-blocks, `app/`)
**Goal ID:** doomstack-layout-pass
**Status:** implemented
**Date:** 2026-09-20

## Goal

Re-compose four existing flows (hub `/`, 1v1 `/duel`, leaderboard `/climb`,
daily `/daily`) so their **hierarchy and composition** match four reference
mockups, using only the existing Tower / ASCENT design system documented in
`app/DESIGN.md`. No new colors, no imported illustration assets, no lava art
skin. Every existing data fetch, auth gate, business rule, and API call is
preserved byte-for-byte in behaviour.

## Scope

### In scope

- Markup / layout / Tailwind-class restructuring of the components listed in
  "Files" below.
- Re-ordering and re-grouping existing content and existing state.
- Purely client-derived presentation state (matchmaking elapsed timer, client
  search filter over an already-fetched list, week-view derived from the
  already-stored daily `best` map).
- One new client component on `/climb` that reads the **existing**
  `GET /api/dashboard` endpoint (same call the dashboard already makes) to
  render the viewer's "your best" panel.
- CTA inventory clean-up required by `app/DESIGN.md` when the new composition
  would otherwise pitch one destination twice on one screen.

### Out of scope

- New API routes, new DB queries, new Prisma models, schema/migrations.
- Payments / Stripe, auth flows, `requireAuth`, rate limiting, trust
  boundaries.
- Game simulation, canvas rendering, `ClimbScene` result/lobby overlays
  (shared with `/play` and replays — changing them would leak outside scope).
- The lava/fire art direction of the mockups (explicitly rejected).
- Merging the climb leaderboard and the duel leaderboard into one page.
- Navbar, footer, `/play`, `/dashboard`, `/duel/chips`, `/duel/[id]`.

### Assumptions

- `A-1` The reference mockups are a **composition** reference only. Where a
  mockup implies data the product does not have, the element is omitted or
  degraded — never faked.
- `A-2` `app/DESIGN.md`'s CTA rule ("one canonical home per destination")
  outranks literal mockup fidelity when the two conflict.
- `A-3` Existing DOM-contract tests (`tests/components/climbFeelSurfaces.test.tsx`,
  `tests/design/*`) encode shipped accessibility/CTA decisions and must keep
  passing unchanged.

### Constraints

- Tokens only from `app/DESIGN.md` / `app/globals.css` / `tailwind.config.ts`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` in `app/` must pass.
- WCAG 2.1 AA; 44×44 px minimum touch targets; usable at 375 px with no
  horizontal overflow.

## Flows

- **F-1 Hub → pick a mode.** Land on `/`, understand the game in one line,
  see the three ways to play, enter one.
- **F-2 1v1 → get into a match.** Land on `/duel`, pick a tier (free /
  ranked / tournaments), then either queue for a random rival or create an
  invite link / open one you were sent; see live search state; see your
  record.
- **F-3 Leaderboard → find yourself.** Land on `/climb`, see the standings,
  see your own best and rank, filter/search, jump to your row, climb again.
- **F-4 Daily → finish today and come back.** Land on `/daily`, see the date /
  streak / reset countdown, play, then see today's result, the week streak
  strip, and where to go until the next tower.

Per flow, the states that must be handled: discovery, entry, precondition
(signed out / anonymous), happy path, empty / first-run, failure + recovery,
success + next step.

## Personas

- **P-1 Drop-in player (no account).** Arrives from a link, wants to play in
  one click, will not sign up first. Starts F-1, F-4.
- **P-2 Returning climber (signed in).** Cares about rank, streak, and their
  W-L record. Starts F-3, F-4.
- **P-3 Challenger.** Wants to beat a specific person. Starts F-2.

## Stories

**S-1 (P-1, F-1)** As a drop-in player, I want the hub to show me the three
ways to play side by side, so that I can choose one without reading the whole
page.
Happy: sees headline → "No account. No download." → one primary CTA → three
mode cards. Failure: stats read fails → cards still render, stat strip shows
`—`.

**S-2 (P-3, F-2)** As a challenger, I want Quick Match and Challenge a Friend
visible at the same time, so that I can pick a path without toggling a menu.
Happy: both cards visible under the tier pills. Failure: create fails → inline
error + retry in the same card, focus restored.

**S-3 (P-3, F-2)** As a challenger who was sent a link, I want to paste it on
the 1v1 page, so that I do not have to trust the sender's URL bar.
Happy: valid link/id → routed to that duel. Failure: unparseable → inline
"That does not look like a Doomstack challenge link." and no navigation.

**S-4 (P-3, F-2)** As a player searching for a rival, I want to see that the
search is alive and how long it has run, so that I know it is not stuck.
Happy: status bar with spinner, `m:ss` elapsed, cancel. Failure: TTL lapses →
timed-out state with a retry.

**S-5 (P-2, F-3)** As a returning climber, I want my best height and rank in a
fixed panel, so that I can see where I stand without scanning the table.
Happy: panel shows height, rank, climbers, and the one primary "Play the
climb". Empty: signed in, never played → "No recorded climb yet" + same CTA.
Precondition: signed out → "Sign in to track your rank" + same CTA.
Failure: fetch fails → panel degrades to the CTA only, table unaffected.

**S-6 (P-2, F-3)** As a returning climber, I want to search the standings and
jump to my own row, so that I can find myself past the top ranks.
Happy: typing filters rows; "Find me" scrolls to and highlights my row.
Empty: no match → "No climber matches <query>" + clear.

**S-7 (P-2, F-4)** As a returning climber, I want today's result, my week
streak, and where to go next, so that the day feels closed out.
Happy: result panel + 7-day strip + "keep climbing" section. Empty (not yet
played): the same panel shows today's tower, the reset countdown, and the
streak so far.

## Acceptance criteria

### Hub (`/`)

- **AC-1** Given the hub, When it renders, Then the hero contains, in DOM
  order: eyebrow, `h1`, pitch paragraph, a CTA row whose first control is the
  filled-signal primary to `/duel`, and the sub-line text `No account. No
  download.`
- **AC-2** Given the hub, When it renders, Then a section labelled
  `Choose your climb` renders exactly three mode cards linking to `/play`,
  `/duel` and `/daily`, each an `<a>` with `min-h-[44px]`.
- **AC-3** Given the hub, When it renders, Then the sign-in line
  (`Already climbing?` → `/auth/signin`) appears once, below the three cards.
- **AC-4** Given the whole landing page, When every section is rendered, Then
  the number of **filled** (`bg-signal`) CTAs pointing at `/duel` is exactly 1
  and at `/play` is exactly 0.
- **AC-5** Given a failed stats read, When the hub renders, Then the mode
  cards and CTAs still render and the stat strip shows `—`.

### 1v1 (`/duel`)

- **AC-6** Given `PAID_DUELS_ENABLED_PUBLIC` is true, When `/duel` renders,
  Then a tier pill row shows `Free 1v1`, `Ranked chips` and `Tournaments`, the
  selected pill carries `aria-pressed="true"`, and `Tournaments` is disabled;
  Given the flag is false, Then the row is absent entirely (one tier is not a
  choice).
- **AC-7** Given the Free tier selected, When it renders, Then `Quick Match`
  and `Challenge a friend` are two sibling cards in one `md:grid-cols-2` grid,
  each with exactly one primary action.
- **AC-8** Given the queue is idle, When it renders, Then no matchmaking status
  bar is in the DOM.
- **AC-9** Given the user pressed `Find opponent`, When the queue is searching,
  Then a status bar renders with a spinner, an elapsed `m:ss` readout that
  increases once per second, and a `Cancel search` control; pressing cancel
  issues the existing `DELETE /api/duel/queue` and removes the bar.
- **AC-10** Given a duel invite string, When `parseDuelInvite` is called, Then
  it returns the duel id for `<origin>/duel/<id>` and for a bare id matching
  `[A-Za-z0-9_-]{6,64}`, and returns `null` for anything else (including
  cross-origin URLs, `javascript:` URLs, and ids with `/` or `.`).
- **AC-11** Given the user is signed in with stats, When `/duel` renders, Then
  a record strip at the bottom of the page shows wins, losses and (when
  non-zero) streak; Given no stats, Then the strip is absent.
- **AC-12** Given the user is signed out or anonymous, When `/duel` renders,
  Then exactly one sign-in gate replaces the action cards.

### Leaderboard (`/climb`)

- **AC-13** Given `/climb`, When it renders, Then a board-scope row links to
  `/climb` (current, `aria-current="page"`) and to `/duel/leaderboard`.
- **AC-14** Given `/climb` at `lg` and above, When it renders, Then the board
  and the "your best" panel are siblings in a two-column grid; below `lg` the
  panel stacks above the board.
- **AC-15** Given a signed-out viewer, When the panel renders, Then it shows a
  sign-in prompt plus the single primary CTA to `/play`; and the primary CTA to
  `/play` appears exactly once on the page.
- **AC-16** Given a signed-in viewer with a record, When the panel renders,
  Then it shows peak height, `#rank`, and `of N climbers` from the existing
  `GET /api/dashboard` payload.
- **AC-17** Given the panel fetch rejects or returns non-200, When it settles,
  Then the panel renders the CTA-only fallback and the standings table is
  unaffected.
- **AC-18** Given a search query, When it does not match any handle, Then the
  board renders `No climber matches "<query>"` and a clear control; When it
  matches, Then only matching rows render.
- **AC-19** Given the viewer's row is present in the standings, When `Find me`
  is pressed, Then that row receives the signal highlight and is scrolled into
  view; Given the viewer is outside the fetched top 50, Then a pinned row
  showing their rank renders below the board instead.
- **AC-20** Given the standings read failed, When `/climb` renders, Then the
  existing `standings unavailable` ember state renders and no `no climbers yet`
  copy appears.

### Daily (`/daily`)

- **AC-21** Given `/daily` before a run, When the page settles, Then a header
  strip shows the local date eyebrow, the `Daily Climb` title, and
  `Next tower in <reset>`.
- **AC-22** Given `/daily`, When the page settles, Then a 7-day streak strip
  renders one cell per weekday of the current week, with the played days marked
  and `aria-label` naming the day and whether it was climbed.
- **AC-23** Given a finished run, When `onFinish` commits, Then a result panel
  renders `You climbed today's tower`, the height readout, the streak count,
  and a `today's best` marker when the run was a day-best.
- **AC-24** Given a finished run, When the result panel renders, Then it does
  **not** duplicate the share or replay controls already rendered by the
  `ClimbScene` result overlay.
- **AC-25** Given `/daily`, When it renders, Then a `Keep climbing` section
  links once to `/play` and once to `/duel`, and the collapsed About prose no
  longer repeats those two destinations as links.
- **AC-26** Given `computeWeekDays(best, lastPlayedKey, now)`, When called,
  Then it returns 7 entries Sunday→Saturday for the week containing `now`,
  `played` true exactly for day keys present in `best` or equal to
  `lastPlayedKey`, and `isToday` true for exactly one entry.

### Cross-cutting

- **AC-27** Given a 375 px viewport, When each of the four pages renders, Then
  no element causes horizontal overflow and every interactive control is at
  least 44×44 px.
- **AC-28** Given `prefers-reduced-motion: reduce`, When any new element
  animates, Then it uses an existing guarded utility (`reveal`,
  `climb-reveal`, `animate-*`) and produces no motion.
- **AC-29** Given the existing suite, When `pnpm lint`, `pnpm typecheck` and
  `pnpm test` run in `app/`, Then all pass with zero warnings.

## NFRs

- **N-1** No new network request on `/`, `/duel` or `/daily`. `/climb` adds at
  most **one** client request, to the existing `GET /api/dashboard`, and only
  when a Firebase token is present.
- **N-2** Client-side search filters an already-fetched ≤50-row array —
  O(n) per keystroke, no debounce needed, no request.
- **N-3** The matchmaking elapsed timer ticks at 1 Hz and is cleared on
  unmount and on every terminal queue state (no leaked interval).
- **N-4** Contrast ≥ 4.5:1 for body text and ≥ 3:1 for UI controls, using
  existing tokens only.
- **N-5** No change to the rendering mode of any page (`/` stays ISR 60 s,
  `/climb` stays `force-dynamic`, `/daily` stays static).

## Risks

- **R-1** `tests/components/climbFeelSurfaces.test.tsx` asserts exact class
  substrings on `Hero`, `FreeLeaderboard`, `ClimbPanelIntro`,
  `ClimbLeaderboard` and `FreeStackShell`. Mitigation: treat those assertions
  as frozen contracts; verified before editing.
- **R-2** `ClimbScene` is shared by `/play`, `/daily` and replays. Mitigation:
  not touched; daily result composition lives at page level.
- **R-3** Adding mode cards to the hub risks duplicating CTAs. Mitigation:
  `DuelPromo`'s filled CTA is downgraded to a plain link so `/duel` keeps one
  filled CTA on the page (AC-4).
- **R-4** `/climb`'s viewer panel introduces a client fetch to a page that had
  none. Mitigation: existing endpoint, token-gated, all failures fall back to
  the static CTA; the table never depends on it.

## Open questions

- **OQ-1** The mockups make `Play free` the filled primary on the hub and
  `Start a 1v1` the secondary — the reverse of shipped IA, which
  `climbFeelSurfaces.test.tsx` (AC-7 baseline: zero filled `bg-signal` `/play`
  CTAs) locks in. Kept as shipped; flipping it is a product decision, not a
  layout one.
- **OQ-2** Mockup 2 shows `Daily` and `Ranked` leaderboard tabs. No daily-only
  board exists and ranked is flag-gated, so the scope row ships with Solo and
  1v1 only.
- **OQ-3** Mockup 3's "who's ahead of you" rail and "today's rank / climbers
  today" need a per-day board the product does not have. Replaced with the
  viewer's own week history, which is already stored locally.

## Future

- A daily-scoped leaderboard (`daily_records` by day key) would unlock the
  mockup's rank + participant count + "who's ahead" rail.
- A time-range filter on `/climb` needs a time dimension on `climb_records`.
- Watch-replay from the daily result panel once a per-run replay id is
  available at page level rather than inside `ClimbScene`.
