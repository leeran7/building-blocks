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
8. **Avatar unlocks derive from self-reported level progress.** The rule
   per avatar lives in `app/src/lib/avatars.ts`: a star count (the server
   sums stored `level_progress.stars` over all seasons), the tutorial (a
   stored level 1 row, any season), or premium (never earned; selectable
   only while it is the saved avatar). `app/src/db/avatarUnlocks.ts` derives
   all of it from stored rows and `PUT /api/settings` refuses a locked
   `avatarId` with 403 `AVATAR_LOCKED` before any write. Unlock state is
   never read from the request, and every non-null `users.avatar_id` write
   must go through `checkAvatarForUser` (the saved-avatar rule is the only
   path to a premium avatar). But level progress is the device's report,
   only sanity-checked (`app/src/db/levels.ts` header), so a modified client
   can unlock every star and tutorial avatar. That is accepted for a
   cosmetic. Avatar unlocks (and anything else built on level stars) must
   never gate money, prizes, or ranking. When premium goes on sale, its
   unlock must come from a server-side purchase record, never level data.
9. **Characters are skins, never pay-to-win.** Every character (stick,
   star-unlocked or premium/paid) plays exactly like the stick figure: same
   hitbox, movement, ladder grab, collisions, power-ups and scoring. The
   simulation models a climber as a point at the feet and never reads the
   avatar; only drawing does (`app/src/components/Game/climber*`). An ESLint
   rule on `app/src/game/**` fails any import of the avatar or character
   modules there. A character may change how a climber looks, never what it
   can do (Leeran, 2026-09-28).
10. **Gems are money.** `users.gems` rises only through `creditGemPack`
   after the provider confirmed payment: the Stripe webhook (paid status,
   USD, `amount_total` equal to the pack's price, pack read from
   `src/lib/gemPacks.ts` by id) or an App Store signed transaction whose
   chain ends at the pinned Apple Root CA - G3, for this bundle, a gem-pack
   product, this account's `appAccountToken`, and not revoked
   (`src/api/appleIap.ts`). Credits are unique on (provider, external id),
   spends on `gem_ledger.idempotency_key`, both under the user row lock,
   and a CHECK keeps gems >= 0. Prices and what a pack credits come from
   the catalogues, never the request. A bought character or skin is an
   `owned_characters` row; that row, never level data, is what makes a
   `purchase` avatar selectable (item 8). A paid lives refill
   (`buyLivesRefill`, `LIVES_REFILL_GEMS`) spends in the same transaction
   that writes `users.lives` and is refused while lives are full, which is
   what keeps a retried request from being charged twice.
