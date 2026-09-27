# Trust boundaries

Security-reviewer and backend start here. These are **this product’s**
irreversible or money-adjacent writes — not generic OWASP.

1. **Client-submitted climb scores.** `peakY` persisted with monotonic
   `Math.max` cannot be lowered later. Treat as a hard trust boundary:
   server-derive or reject. A comment that says verification happens
   elsewhere is not a control until that path exists.
2. **Stripe webhooks credit altitude.** Gate on the provider’s
   `payment_status` (or equivalent success state), not merely event type.
   A 4xx on an unresolvable reference permanently drops a captured payment
   on providers that do not retry 4xx — dead-letter and ack 2xx when the
   event cannot be applied.
3. **`INTERNAL_TOKEN` and admin bearer.** Use the repo’s constant-time
   compare helper. New token-authenticated routes get the same rate limiter
   as the existing privileged routes.
4. **Do not forward secrets to URLs derived from the request** (host
   header, origin, redirects).
5. **Middleware is presence-only.** Authorization lives in route handlers
   (`requireAuth` / `requireAdmin`). Do not treat middleware as an access
   control layer.
6. **Allow-list parsers, reject never default.** User-keyed lookups use
   `Object.hasOwn` (or equivalent). Write-on-read `getOrCreate` on public
   GET paths creates ghost records — confine creation to authenticated
   write paths and grep every caller of the symbol.
7. **Obstacle and ramp geometry is part of the anti-cheat trust anchor.**
   The server `simulateDuel` re-simulates input logs and flags K=5
   consecutive ticks above `isHeightDeltaLegal`. A ramp turns ground speed
   into vertical speed, so ramp slope must come from `maxRampSlope` in
   `app/src/game/obstacles.ts`. Any new ground-speed boost must be folded into
   it. Stored replays (`climb_runs.replay_token`, `duels.player*_replay`,
   `daily_climb_scores.replay_token`) are input logs re-simulated with
   current code. `REPLAY_VERSION` is the envelope format only and is never
   checked against the engine. Any change to `obstaclesForFloor` or
   `stepMatch` therefore desyncs old replays and in-flight duels. Call this
   out in the PR. The one engine-version check is on the Daily Climb:
   `POST /api/climb/daily/result` refuses a `simVersion` other than
   `DAILY_SIM_VERSION` (`app/src/game/simVersion.ts`) with 409 before it
   re-simulates, and stamps `sim_version` on each daily score. Bump it in
   the same change as any engine edit that changes the free stack's output,
   which `app/tests/game/freeStackGolden.test.ts` pins. That locks installed
   mobile builds out of the daily board until they update (docs/deploy.md).
   Level-only engine fields (`tower.goalM`, `tower.difficulty`, …) leave the
   golden hashes alone and bump `LEVEL_SIM_VERSION` instead. Duels and
   endless replays still have no version.
