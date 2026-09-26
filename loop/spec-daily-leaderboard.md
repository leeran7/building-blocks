# Spec: Daily Climb leaderboard (mobile), plan steps 1–3

**Product:** The Climb (building-blocks) · **Goal ID:** daily-climb-leaderboard-mobile
**Status:** implemented (iteration 1) · **Date:** 2026-09-26

## Goal

The Daily Climb copy promises "one shot at the top of the daily board", but no
daily board exists. Daily runs post to the all-time board with a height the
client reports. Ship a real per-day board on mobile. The day is the UTC day
and the server decides it. Every height on the board comes from the server
re-simulating the run.

## Scope

**In:** a shared UTC day module; `GET /api/climb/daily`; the `DailyClimbScore`
model and migration; `POST /api/climb/daily/result` with server re-simulation;
`GET /api/climb/daily/leaderboard{,/friends}`; mobile Today | All-time
Ranks screen; ClimbScreen and HomeScreen daily wiring; web `DailyClimbClient`
moved to the UTC day and the daily route (no new web UI).

**Out (Future):** a web daily leaderboard tab, push notifications, yesterday's
winners, a replay/sim version check, runs longer than `MAX_SHARE_TICKS`
(10 min) on the daily board.

**Assumptions:** the free board's consent rule (`leaderboard_consent_at`)
applies to the daily board. A daily save also raises the all-time record,
using the same server peak. Client and server run the same engine build (see
Risks).

## Flows

| F | Critical | Trigger → entry | Happy path | Empty / failure | Success next |
|---|---|---|---|---|---|
| F-1 Play today's tower | yes | Home DailyCard → `/climb?daily=1` | Seed comes from the server (falls back to the device's UTC day). Run → replay is encoded → POST daily/result → server rank shown | Offline: local seed, and the results card shows "couldn't reach today's board" with Try again. Closed day / mismatch / too long: a plain reason, no retry. Guest: "sign in to save". No consent: the consent sheet appears first | "See today's board" CTA, Play again |
| F-2 Check today's board | yes | Ranks tab (Today is the default) | Podium plus table, header "Today's tower · Resets in Xh Ym", your banner, and a pinned row (#rank · height · tries) when outside the top 50 | Loading skeleton. Empty: "No one's climbed today's tower yet. Be first." plus Play. Error: RetryPanel. Not played: "Not on today's board" → Play | Play today's tower |
| F-3 Friends today | no | Ranks → Today → Friends | You plus consented friends for today, with a hidden/not-climbed footer | No friends: "Race your friends" → /challenge. Error: RetryPanel | Find friends |
| F-4 Opt in from the board | yes | Today banner "You're hidden" → "Show me on the board" | Consent sheet → PUT settings → board refetches | PUT fails: the sheet closes and the banner stays hidden (can retry) | Play today's tower |
| F-5 Midnight rollover | yes | App open across 00:00 UTC | `useUtcDay` fires at the reset. Day slices refetch cold (skeleton), the countdown resets, and the DailyCard drops yesterday's rank | A run that straddles the reset is accepted for its day within 10 min, then DAY_CLOSED | New day's board |
| F-6 Home glance | no | Home | DailyCard shows "#N today · H ft · Resets in …" once the server knows your rank | Unknown rank: falls back to the local best / countdown | Tap → F-1 |

Mid-flow interrupts (F-1): a double POST adds one attempt and cannot lower
the best (atomic upsert). If the app is killed before the POST, only the local
streak is kept.

## Personas

- **Commuter climber:** plays one daily run on the train (F-1, F-2, F-6).
- **Friend rival:** checks whether friends beat today's tower (F-3).
- **Privacy-first player:** opted out, opts in to compete today (F-4).

## Stories and ACs

**S-1 (F-1).** As a commuter climber, I want my daily run ranked by the
server, so that the board is fair.
- AC-1: Given a valid replay of today's tower, when POSTed with a Bearer, then
  200 `{saved:true, day, peakY, improved, rank, totalClimbers, attempts}` and
  the stored peak equals the server re-sim.
- AC-2: Given a body/token peak differing from the re-sim by > 0.1 m, then 400
  `REPLAY_MISMATCH`, logged, nothing written.
- AC-3: Given yesterday's seed at 00:05 UTC, then accepted for yesterday; at
  00:11 UTC, then 400 `DAY_CLOSED`. Any other seed → `DAY_CLOSED`.
- AC-4: Given no replayToken → 400 `REPLAY_REQUIRED`. Given > MAX_SHARE_TICKS →
  400 (decode or `RUN_TOO_LONG`).
- AC-5: Given no token / anonymous / no consent → 200 `{saved:false, reason}`
  and no re-simulation or write.
- AC-6: The per-IP limit shares namespace `climb` with /result; the per-user
  limit key is `climb:daily:<uid>:<day>`; over the limit → 429 `RATE_LIMITED`.

**S-2 (F-2, F-5).** As a commuter climber, I want to see today's standings
and when the tower resets.
- AC-7: `GET /api/climb/daily/leaderboard` returns ≤ 50 consented rows,
  ordered peak desc, then earliest `updated_at`, then userId, plus `day`,
  `resetsAt`, `totalClimbers`, and `me` (Bearer) or null.
- AC-8: `?day=` that is not a real YYYY-MM-DD → 400 `INVALID_DAY`. A future day
  or one > 7 days old → 400 `DAY_OUT_OF_RANGE`.
- AC-9: Mobile Ranks opens on Today (tabs are a WAI-ARIA tablist with arrow
  keys). `?board=alltime` opens All-time.
- AC-10: When the player's rank > the rows shown, a pinned row shows
  rank · height · tries.
- AC-11: When the device UTC day changes, the day slices refetch cold.

**S-3 (F-3).** As a friend rival, I want today's friends board.
- AC-12: `/friends` requires auth (401 otherwise) and returns you plus
  consented accepted friends for the day, with hiddenCount and notClimbedCount.

**S-4 (F-1, F-6).** As a commuter climber, I want the local streak on the
same day as the board.
- AC-13: Daily day keys, seed, reset and streak use UTC. A legacy local-key
  store migrates once: a future last-played key is clamped to today, and
  future bests are dropped.

## NFRs

- Re-sim cost is about 20 µs/tick, so the 18 000-tick worst case is under
  0.5 s. Bounded by 20 submissions per user per day per 5 min.
- The public board is cached per day for 30 s (`unstable_cache`). `me` is
  uncached. Cache keys are limited to 8 days by validation.
- Mobile bundle: +3.3 kB gzipped.
- A11y: WCAG 2.1 AA, 44 px targets, live regions on the rank line and banner.

## Risks

- **No engine version on replays** (`REPLAY_VERSION` is not a sim version). A
  deploy that changes `stepMatch` or obstacles mid-day desyncs same-day
  re-sims (400 mismatch). `DAILY_SIM_VERSION` is stamped on rows so affected
  rows can be found.
- **Cross-engine float determinism** (JavaScriptCore on iOS vs V8 on the
  server). Duel re-sim already depends on this. A drift beyond 0.1 m shows up
  as logged mismatches.
- **UTC switch** moves the reset time for everyone. A player far from UTC can
  lose one streak day during migration.
- **Bots** that play legally pass re-sim. Re-sim stops forged heights, not
  automation.

## Open Questions

None blocking. Should runs longer than 10 min get a server path? (Future.)
