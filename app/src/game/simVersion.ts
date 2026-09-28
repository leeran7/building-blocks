/**
 * Engine revision shared by the clients and the server. SEC-DC-4: clients
 * send it with every daily result, and the server rejects a different value
 * with 409 SIM_VERSION_MISMATCH BEFORE re-simulating. A stale mobile build
 * then gets "update the app" instead of a REPLAY_MISMATCH that looks like
 * a forgery. The value is also stamped on each stored daily score.
 *
 * Bump it in the same change as any edit that changes the free stack's
 * output: its geometry, stepMatch on an endless tower, power-ups or hazard
 * tuning. tests/game/freeStackGolden.test.ts pins that output, so a change
 * that leaves the golden hashes untouched (a level-only field such as
 * tower.goalM or tower.difficulty) does not bump it. Client-safe: no imports.
 */
export const DAILY_SIM_VERSION = 3;

/**
 * Engine revision for Level System runs (level tickets and
 * LevelProgress rows), separate from DAILY_SIM_VERSION so level-only engine
 * work never locks installed apps out of the Daily. Bump it in the same change
 * as any edit that changes a level tower's output: its geometry, the finish,
 * the level power-up rules or the level lava.
 */
export const LEVEL_SIM_VERSION = 3;
