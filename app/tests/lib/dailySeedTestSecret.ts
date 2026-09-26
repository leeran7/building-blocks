/**
 * A throwaway DAILY_SEED_SECRET for tests (>= DAILY_SEED_SECRET_MIN_LENGTH).
 * Never a real key.
 *
 * The daily tower now depends on this secret. It was chosen so the scripted
 * replay fixture (hold a random direction for 10 ticks, climbY 1, jump every
 * 23 ticks, RNG state 28; see tests/game/dailyVerify.test.ts) climbs ~7.6 m on
 * 2026-09-26's tower and dies at ~2.57 m on 2026-09-24, -25 and -27. Tests
 * that depend on "these inputs only mean something on this tower" assert
 * that contrast as a precondition, so a change here fails them loudly.
 */
export const TEST_DAILY_SEED_SECRET = "test-only-daily-seed-secret-0034-0123456789";
