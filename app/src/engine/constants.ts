/**
 * Engine constants — read from process.env with safe defaults.
 * All constants are injected via this module; no magic numbers elsewhere.
 */

export interface EngineConstants {
  /** Views (thousands) per rate doubling. Default: 500 */
  DOUBLE_EVERY_K: number;
  /** Hard cap on growth multiplier. Default: 8 — MANDATORY */
  MAX_GROWTH: number;
  /** Initial altitude units per dollar at season start (shown as ft). Default: 1.0 */
  R0: number;
  /** Initial ground altitude at season start (shown as ft). Default: 0.5 */
  G0: number;
  /** Minimum first payment in USD. Default: 5.00 */
  MIN_ENTRY_USD: number;
  /** Minimum top-up payment in USD. Default: 2.00 */
  MIN_SPEND_USD: number;
  /** Season length in days. Default: 90 */
  SEASON_DAYS: number;
  /** Global qualified view ceiling per hour. Default: 40000 */
  CEIL_PER_HOUR: number;
}

function parseEnvFloat(key: string, defaultVal: number): number {
  const val = process.env[key];
  if (val === undefined || val === "") return defaultVal;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? defaultVal : parsed;
}

/**
 * Load engine constants from environment variables, with defaults.
 * All optional — safe to call without any env vars set.
 */
export function loadConstants(): EngineConstants {
  return {
    DOUBLE_EVERY_K: parseEnvFloat("DOUBLE_EVERY_K", 500),
    MAX_GROWTH: parseEnvFloat("MAX_GROWTH", 8),
    R0: parseEnvFloat("R0", 1.0),
    // G0 tuned to satisfy AC-6: $5 entry buried at V≈1472k (within 1400-1600 range).
    // Spec §3.5 says "Tune G0/DOUBLE_EVERY_K until this holds."
    // With G0=0.65: max_ground = 0.65*8 = 5.2 > 5.0 (burial possible)
    // V_burial = ln(5/0.65) * 500 / ln(2) ≈ 1472k (within 1400-1600).
    G0: parseEnvFloat("G0", 0.65),
    MIN_ENTRY_USD: parseEnvFloat("MIN_ENTRY_USD", 5.0),
    MIN_SPEND_USD: parseEnvFloat("MIN_SPEND_USD", 2.0),
    SEASON_DAYS: parseEnvFloat("SEASON_DAYS", 90),
    CEIL_PER_HOUR: parseEnvFloat("CEIL_PER_HOUR", 40000),
  };
}

/** Default constants (convenience singleton — safe to use in pure tests) */
export const DEFAULT_CONSTANTS: EngineConstants = loadConstants();
