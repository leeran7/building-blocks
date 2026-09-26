/**
 * Engine revision shared by the clients and the server. SEC-DC-4: clients
 * send it with every daily result, and the server rejects a different value
 * with 409 SIM_VERSION_MISMATCH BEFORE re-simulating. A stale mobile build
 * then gets "update the app" instead of a REPLAY_MISMATCH that looks like
 * a forgery. The value is also stamped on each stored daily score.
 *
 * Bump it in the same change as any edit to stepMatch, obstaclesForFloor,
 * power-ups or hazard tuning. Client-safe: no imports.
 */
export const DAILY_SIM_VERSION = 1;
