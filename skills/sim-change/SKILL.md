---
name: sim-change
description: >-
  Use when a change touches the game simulation under `app/src/game/`: tower
  or obstacle geometry, stepMatch, power-ups, hazard or lava tuning, level
  formulas, or any tuning constant. Also when golden hashes move, the season
  gate fails, or SIM_VERSION_MISMATCH or REPLAY_MISMATCH appears.
---

# Simulation Change

The server re-simulates input logs with the current engine. Changing what the
engine outputs changes what installed apps, stored replays and in-flight duels
mean. Decide which output moved, and bump its version in the same change.
More than one row can apply (a power-up constant used everywhere moves the
free stack and the levels): apply each.

## Which version

| What moved | How you know | Bump | Consequence to handle |
|------------|--------------|------|-----------------------|
| Free stack output: endless, Daily Climb and duels all run on it | A hash in `app/tests/game/freeStackGolden.test.ts` changes | `DAILY_SIM_VERSION` in `app/src/game/simVersion.ts`, and the pinned hashes | The server refuses daily results from every installed build (409 `SIM_VERSION_MISMATCH`) until players update. Ship with a store build: `mobile-release` skill. The version guards the daily board only |
| A level tower's output: geometry, the finish, level power-up rules, level lava | Golden hashes hold, but `pnpm season:verify` or a level test changes | `LEVEL_SIM_VERSION` in the same file | Installed builds are refused a level ticket (409 `SIM_VERSION_MISMATCH`; the app shows its update prompt) |
| What a level is: a formula in `app/src/game/levels/levelSpec.ts` | You edited a formula there | `LEVEL_SPEC_VERSION`, and `LEVEL_SIM_VERSION` too when the built tower changes | The committed manifest is refused until regenerated |
| Endless replays and duels | Nothing checks: they carry no engine version | — | Old `/play?r=` links and in-flight duels re-simulate differently. Say so in the PR (`context/trust.md` item 7) |

A golden hash that moves when you meant a level-only change is a bug in the
change, not a hash to update.

## Check the season on every engine change

The season manifest stores each level's route time, lava and star pars,
measured by a bot through the real engine. Any change a level run can reach
(all three rows above) can invalidate it.

```bash
cd app
pnpm season:verify 1     # the gate CI runs: replays the bot against the committed manifest
pnpm season:generate 1   # only if verify fails; refuses to write unless every level passes
```

If you regenerated, commit `src/game/levels/seasons/season-1.json` with the
engine change. Lava is derived from the bot's measured catch point, so a
tuning change may be partly absorbed by regeneration: compare the manifest
diff with what you intended.

## After any geometry, speed or constant change

Work through `.claude/rules/testing.md`. The ones that have gone stale here
before:

- Re-run every mutant that was proven red before; fixtures move and guards go dark.
- Grep comments and tests for the old derived numbers, and for bounds the new value can never cross.
- Every randomness source a step can reach needs a re-simulation fixture that triggers it (count > 0).
- A new ground-speed boost must be folded into `maxRampSlope` in `app/src/game/obstacles.ts`.
- Nothing under `app/src/game/` may import avatar or character modules: characters are skins.

## Common mistakes

| Mistake | Result |
|---------|--------|
| Engine change with no version bump | Old clients' runs fail as `REPLAY_MISMATCH`, which reads as cheating |
| Bumping `DAILY_SIM_VERSION` for a level-only change | Every installed app is locked out of the daily board for nothing |
| Deploying a bump before the store build is live | Players cannot post until the update exists |
| Updating a golden hash without a PR note | The next reviewer cannot tell an intended change from a regression |
