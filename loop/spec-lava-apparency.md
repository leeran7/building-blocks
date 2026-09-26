# Make the lava apparent all match long (and easier on new players)

## Context

The rising hazard (`app/src/game/hazard.ts`) is a pure curve in race-time: 0.42× ladder
speed ramping to 1.0× over 90 s, with a 12 s surge/stumble cycle (time-averaged 0.75×).
Catch-up is a binary 1.25× clock kick once the leader is more than 250 ft ahead, which
nets 0.94× ladder speed and so never reclaims ground on anyone climbing faster than that.

The camera (`climbCamera.ts`, `CAMERA_FOCUS_FRAC = 0.62`) shows only ~68 ft below the
climber on the locked 9:16 view. Modelling a constant-pace climber against the real
`hazardHeightAt` (5-minute run, 9 ft/s ladder):

| Climber pace (× ladder) | Gap after ramp | Lava on screen (after opening) | Caught at | Peak |
|---|---|---|---|---|
| 0.45 | – | 100% (last 30 s) | 73 s | 296 ft |
| 0.55 | – | 45% | 118 s | 585 ft |
| 0.75 | 127–224 ft | 0% | never | – |
| 0.85 | 154–267 ft | 0% | never | – |
| 1.00 | 195–630 ft | 0% | never | – |

So the lava is visible only in the opening 10 s and the final 30 s of a dying run. For
anyone who keeps ≥70% of ladder speed it is a HUD number for the whole match, and the
HUD's SURGING/STUMBLING phase readout describes something the player never sees. At
the same time the base curve is the *only* thing that kills weak climbers, which is why
new players stall at 300–500 ft: the curve has to be fast enough to matter to good
climbers, so it is too fast for beginners.

**Design principle:** split the two jobs. The base curve sets the kill threshold
(how far a beginner gets). A continuous **leash** on the lava clock sets how close it
rides behind anyone faster than the curve (apparency). With a leash, the curve can be
gentler without the lava vanishing for good players.

Recommended tune (modelled, same harness as above, camera showing 80 ft below; the
16 s cycle chosen below shifts these by a few ft, e.g. 0.5 pace → 581 ft, 0.85 pace
gap 53–82 ft):

| Pace | Gap band (after 30 s) | Lava on screen | Caught at → peak | Full stall survivable |
|---|---|---|---|---|
| 0.45 | – | 100% | 116 s → 472 ft (was 296) | 0 s (was 0) |
| 0.55 | – | 100% | 152 s → 753 ft (was 585) | 0 s (was 0) |
| 0.60 | – | 100% | 219 s → 1181 ft (was 839) | 0 s |
| 0.70 | 47–83 ft | 99% | never | 12.8 s (was 15.9) |
| 0.85 | 57–96 ft | 97% | never | 12.9 s (was 39.7, all hidden) |
| 1.00 | 66–106 ft | 90% | never | 12.6 s (was 46.9) |
| 1.30 (jetpack burst) | 85–128 ft | 0% while bursting | never | – |

Beginners get ~60% further, mid-skill and strong climbers see the lava almost all the
time, and a mistake still has a ~13 s window (with stumbles as visible recovery windows).
Kill threshold moves from ~0.70× to ~0.64× ladder pace. The 1.0× hard cap on the curve
is kept, so holding a ladder still always outruns the lava inside the leash band.

### Surge & stumble

Today's 12 s cycle (8 s surge, 4 s stumble at 0.25×) is what the HUD labels
SURGING/STUMBLING, but once the lava is in view it only moves the gap by ~20 ft at
~5 ft/s, and nothing but the HUD label reacts to it. Modelled rhythms with the
time-averaged speed held at 0.64× (so beginner reach is unchanged), leash + camera as above:

| Cycle (period / stumble @ frac) | Envelope needed | Gap swing @0.85 pace | Close rate | Worst / best stall @0.85 | On screen @1.0 |
|---|---|---|---|---|---|
| 12 s / 4 s @ 0.25 (today) | 0.85 | 20 ft | 4.6 ft/s | 9.6 / 11.8 s | 94% |
| 10 s / 3 s @ 0.30 | 0.81 | 18 ft | 3.5 ft/s | 9.9 / 11.6 s | 100% |
| **16 s / 6 s @ 0.20** | **0.91** | **29 ft** | **6.5 ft/s** | **8.4 / 11.8 s** | **80%** |
| 16 s / 5 s @ 0 (full pause) | 0.93 | 32 ft | 7.3 ft/s | 8.0 / 11.7 s | 76% |
| 20 s / 8 s @ 0.15 | 0.97 | 40 ft | 8.8 ft/s | 7.4 / 12.0 s | 72% |
| 24 s / 10 s @ 0.15 | 0.99 | 42 ft | 10.1 ft/s | 6.6 / 12.3 s | 69% |

Pick **16 s / 6 s @ 0.20**: the swing is a third of the visible band (readable as
breathing), a 10 s surge is long enough to feel hunted and a 6 s stumble is long enough
to plan a traverse or recover a missed ladder, and the worst-case stall only loses ~1 s.
Longer cycles look dramatic but punish a stall that lands at the start of a surge.

The other half is presentation: the lava body itself must look different in a surge
and a stumble, and the surge must be telegraphed a second before it lands, or the
cycle is still invisible. That is rendering + a cue, no further sim change.

## Changes

Substantial sim change: run through the closed-loop pipeline (`/closed-loop`) per
CLAUDE.md. All sim edits stay pure/deterministic (AC-11 re-simulation).

### 1. Sim: leash + gentler curve — `app/src/game/hazard.ts`

- `DEFAULT_HAZARD_CONFIG`: `endSpeedFrac: 1 → 0.91`, `rampSeconds: 90 → 120`,
  `stumblePeriodSeconds: 12 → 16`, `stumbleDurationSeconds: 4 → 6`,
  `stumbleSpeedFrac: 0.25 → 0.2`. Head-start, grace and start fraction unchanged.
  Update the tuning comment: time-averaged late speed = 0.91·(10/16 + 6/16·0.2) = 0.64×,
  and a note that `endSpeedFrac` is derived from the target mean and the cycle duty
  (change one, recompute the other).
- Replace `HAZARD_CATCHUP_LEAD_M` / `HAZARD_CATCHUP_TIME_SCALE` with
  `HAZARD_LEASH_M = 50`, `HAZARD_LEASH_RANGE_M = 40`, `HAZARD_CATCHUP_MAX_SCALE = 3`.
- `hazardCatchupTimeScale(leadM)` becomes continuous:
  `lead ≤ LEASH ? 1 : min(MAX, 1 + (lead − LEASH) / RANGE)`. Non-decreasing in lead,
  continuous at the boundary, capped, deterministic. Keep the 1e-6 float slack.
  Same name/signature so `simulation.ts` needs only its comment updated
  (the "250m" text at `simulation.ts:498-507`).
- Rewrite the header doc: leash replaces the binary kick; explain the two-knob split
  and the numbers above (so the next tuner does not re-derive them).
- Only `hazard.ts` and `tests/game/hazard.test.ts` reference the old constants.

### 2. Sim version — `app/src/game/simVersion.ts`

`DAILY_SIM_VERSION = 1 → 2` (its own doc comment requires this for hazard tuning).
Effect: stale clients get 409 `SIM_VERSION_MISMATCH` on daily posts; stored v1 scores
keep their stamp. Note in the PR: duel clients on different builds disagree on the
shared hazard until both update (same class as any sim change).

### 3. Camera — `app/src/components/Game/climbCamera.ts`

`CAMERA_FOCUS_FRAC: 0.62 → 0.55` (view-below 68 → 80 ft, look-ahead 110 → 98 ft).
Same lock on every device, so no leaderboard edge. `climbCamera.test.ts` uses the
constant symbolically; re-check `mobileLavaClearance.test.tsx` (layout, not focus).

### 4. Rendering: off-screen proximity cue — `app/src/components/Game/lava.ts` + `paintClimbFrame.ts`

New exported `drawLavaProximityGlow(ctx, { width, height, ui, tick, reducedMotion,
gapBelowViewM, bottomInset })` in `lava.ts`, called from `paintClimbFrame.ts` right
where `drawLava` is skipped (`hazScreenY >= height`, ~line 318). When the lava is within
`LAVA_PROXIMITY_M = 60` of the visible bottom (above `bottomInset`, so the touch overlay
never hides it): a bottom-edge ember linear gradient, alpha `0.35·(1 − d/60)`, plus a
slow pulse from `tick` (static under reduced motion). Deterministic, wrapped in
save/restore, no per-frame allocations beyond the gradient (cache like `getBodyGradient`).
Export a pure `proximityAlpha(gapM, reducedMotion, tick)` so tests assert output, not
source text.

### 5. Feedback thresholds

- `ClimbScene.tsx:247` `musicIntensity = (40 − gap)/40` → ramp over the leash band:
  `(HAZARD_LEASH_M + 40 − gap) / (HAZARD_LEASH_M + 40)` (import the constant). Mirror
  in `DuelRoom.tsx` if it computes its own intensity (it passes `lavaPhase`; check).
- `ExpeditionHud.tsx:27` `danger = clearance <= 12` → exported `LAVA_DANGER_FT = 24`
  (~2.7 s at 9 ft/s; 12 ft was ~1.3 s).
- `powerUpAudio` doom loop stays gated on `lavaOnScreen`.

### 6. Surge & stumble made visible — `lava.ts`, `paintClimbFrame.ts`, `powerUpCues.ts`, `powerUpAudio.ts`

- `paintClimbFrame.ts` computes `hazardPhase(state.raceSeconds - state.hazardSlowSeconds)`
  (same call `ClimbScene.tsx:257` and `DuelRoom.tsx:644` already make) and passes
  `phase` + `progress` into `drawLava` via `LavaOptions`.
- `lava.ts`: a pure exported `phaseLook(phase, progress, reducedMotion)` returning
  `{ crestAmp, rimAlpha, emberCount, bubbleCount, hazeGain, telegraph }`:
  - surge: crest amplitude 12 (was 9), rim alpha 0.5, all 6 embers, haze 1.3×;
  - stumble: crest amplitude 5, rim alpha 0.3 with a darker cooled-skin rim tone,
    2 embers, 3 bubbles;
  - telegraph: over the last `SURGE_TELEGRAPH_FRAC = 0.2` of a stumble (~1.2 s),
    crest amplitude and rim alpha ramp back up with a `tick`-driven pulse, so the
    surge is announced before the gap starts closing;
  - reduced motion: amplitudes fixed at 0 (crest stays flat as today); only colour and
    alpha differ between phases; no pulse.
  `crestOffset` takes the amplitude from `phaseLook` instead of the hard-coded 9/4
  (keep the "always ≤ 0" guarantee — the body never dips below the lethal line).
  Harden-lava keeps precedence over phase look, and slow-lava keeps its calm palette.
- `powerUpCues.ts`: add `lavaPhase` to the world input and a `"lava-surge"` world cue
  emitted on the stumble → surge transition while `lavaOnScreen` (or within the
  proximity band) — never on run start, and the memo resets per `runId` like
  `lavaOnScreen`. `powerUpAudio.ts` gets `playLavaSurge()`: a short low whump in the
  same style as `playLavaSting`. Doom-loop LFO rate (`powerUpAudio.ts:360`) takes the
  phase too: faster during a surge.
- HUD: no markup change; the existing `exp-phase-track` bar now spans a 10 s / 6 s
  cycle, which is what makes it readable.

## Tests (per `.claude/rules/testing.md`: invoke the unit, prove negatives on positive fixtures)

- `tests/game/hazard.test.ts`: replace the "catch-up" describe with leash tests —
  1× at and below `HAZARD_LEASH_M`; strictly increasing beyond; continuous at the
  boundary (`f(L+ε) ≈ 1`); capped at `HAZARD_CATCHUP_MAX_SCALE`; deterministic.
  Existing AC-5/6/7 tests read `CFG.*` symbolically and should pass; the
  `startSpeedFrac`-based opening test is unaffected (start unchanged).
- New `tests/game/hazardLeash.test.ts` driving the **real** `stepMatch` with the
  ghost-slaving path (`opts.localSlot` set to a slot no player has, so the sim counts
  players in the hazard but does not integrate them; set `p.y += pace·maxClimbSpeed·TICK_DT`
  per tick). Assert: pace 0.7–1.0 keeps `y − hazardY` within [40, 115] after 30 s
  (leash holds, lava never runs away); pace 0.5 is eliminated with `peakY > 550`
  (beginner floor); pace 0.45 is eliminated (run still ends); a 10 s stall at pace 0.85
  survives, a 20 s stall does not. Include the `expect(checked).toBeGreaterThan(0)`
  guard on any tick-skipping loop.
- `tests/game/simulation.test.ts` greedy-bot "ends the run under the real hazard" must
  still pass (bot pace is well under 0.64); if it now exceeds the 20000-tick cap, raise
  the cap, do not weaken the assertion.
- `tests/game/lava.test.ts`: `proximityAlpha` is 0 when the lava is on screen or
  beyond 60 ft, positive inside the band, monotone in gap, tick-static under reduced
  motion; draw-budget test balances save/restore and resets composite.
  `phaseLook`: surge amplitude > stumble amplitude; telegraph window raises amplitude
  above the plain stumble value and below/equal to surge; reduced motion gives 0
  amplitude for every phase while alpha still differs; `crestOffset` stays ≤ 0 for
  every phase/progress on a grid of x and ticks (with the `checked > 0` guard).
- `tests/game/hazard.test.ts`: `hazardMeanSpeedFrac(DEFAULT_HAZARD_CONFIG)` ≈ 0.64
  (pins the documented mean so a future cycle edit that silently changes the kill
  threshold goes red); existing stumble tests still read `CFG.*` symbolically.
- `tests/game/powerUpCues.test.ts`: `lava-surge` fires exactly once on stumble → surge
  while the lava is on screen; not on grace → surge at run start; not when off screen;
  memo resets on a new `runId`.
- Mutation check before trusting the new tests: flip the leash to the old binary
  function and confirm the equilibrium test goes red; set `endSpeedFrac` back to 1 and
  confirm the beginner-floor test goes red.
- Run `yarn test`, `yarn lint`, `yarn typecheck` in `app/` (deps are not installed in
  this container; `yarn install` first).

## Verification (end-to-end)

1. `yarn dev`, open `/play`, climb at a normal pace: lava crest should be visible below
   within ~30 s and stay within roughly one screen; SURGING/STUMBLING on the HUD should
   visibly match the crest rushing up and easing off.
2. Stand still on a floor: lava reaches your feet in ~10–14 s (not ~40 s).
2b. Watch one full cycle with the lava in view: the crest calms and dims for ~6 s
   (STUMBLING on the HUD), pulses brighter in the last second, then rushes up ~30 ft
   with the surge cue; the HUD bar and the crest agree.
3. Grab a jetpack orb: lava drops off screen, bottom-edge glow fades in as it returns,
   crest reappears within ~10 s.
4. Confirm a daily post from this build succeeds and a v1 client is rejected with 409.

## Out of scope / follow-ups

- No mercy slow-down when the lava is at the heels: with any floor on the clock scale,
  a climber whose pace exceeds `floor × mean` never dies, which breaks the endless-run
  guarantee `powerups.ts` documents. If beginner reach still needs help after this
  lands, tune `endSpeedFrac`/`rampSeconds` (the kill-threshold knobs), not the leash.
- Leash knobs are independent: `HAZARD_LEASH_M` = where the lava rides (visibility),
  `HAZARD_LEASH_RANGE_M` = how quickly it closes, `endSpeedFrac` = who dies.

## Revision 2 (after review, user decisions 2026-09-26)

Measured after iteration 1: a flawless unaided player's pace is capped at about
0.55–0.62× ladder speed by walking between ladders. The 0.7–1.0× rows above
are power-up burst paces. The leash is engaged for 26–46% of a realistic run
and is what keeps the lava on screen.

### R2-1. Leash follows the trailing climber (security critical SEC-LAVA-1, user decision)

`climbingLeadM` takes the LOWEST climbing player's lead (0 when none are
climbing). A peer's reported position can then only lower the lava clock,
never raise it. Solo and daily have one player, so they are unchanged. In
duels the lava hunts whoever is behind, so a lead or a single burst no longer
drags the lava onto the opponent.

Tests: a spoofed ghost reporting y = hazardY + 500 does not change the honest
client's hazard (proven red against Math.max); a leader + trailer pair keeps
the trailer's gap inside the leash band; the server duel re-sim and the
client's local sim agree on the hazard during an opponent's burst.

### R2-2. Late-game creep (user decision)

New `HazardConfig.creepPerMinute = 0.02`. After the ramp the envelope keeps
rising by 0.02 per minute of hazard time, capped at `MAX_HAZARD_SPEED_FRAC`
(1.0, the lava never outruns a ladder). With the 16 s / 6 s @ 0.2 cycle the
time-averaged speed goes from 0.64× at the end of the ramp to 0.70× at the
cap (about 6.5 min in). 0.70 is above the best unaided pace, so every run
ends; only power-ups extend it.

Modelled (leash on):

| Pace | No creep | Creep 0.02/min |
|---|---|---|
| 0.45–0.55 | unchanged | unchanged (±3 ft) |
| 0.60 | 199 s / 1072 ft | 182 s / 982 ft |
| 0.62 | 323 s / 1802 ft | 226 s / 1260 ft |
| 0.64 | never caught | 286 s / 1650 ft |
| 0.66 | never caught | 362 s / 2149 ft |

The integral must stay closed-form (piecewise linear envelope: ramp, creep,
hold at cap). No per-tick scan (.claude/rules/architecture.md).
