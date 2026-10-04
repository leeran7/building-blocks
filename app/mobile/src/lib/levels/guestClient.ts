import { createMockLevelsClient, type MockClientOptions } from "./mockClient";
import type { LevelsClient } from "./model";

/**
 * Guests play levels 1 to GUEST_LEVEL_CAP on the device; every level above
 * it asks them to sign in (Leeran, 2026-10-04).
 */
export const GUEST_LEVEL_CAP = 3;

/** Whether a guest must sign in to play this level. */
export function isGuestLocked(level: number): boolean {
  return level > GUEST_LEVEL_CAP;
}

/**
 * The guest's level client: the device-local mock under its "anon" store,
 * refusing every level above the cap. It never talks to the server, so
 * nothing a guest earns is sent anywhere, and device stars never reach an
 * account (the server must not trust them).
 */
export function createGuestLevelsClient(opts: Omit<MockClientOptions, "accountId"> = {}): LevelsClient {
  const local = createMockLevelsClient({ ...opts, accountId: undefined });
  return {
    getSeason: () => local.getSeason(),
    startLevel: (level, start) =>
      isGuestLocked(level) ? Promise.resolve({ ok: false, code: "LOCKED" }) : local.startLevel(level, start),
    submitResult: (ticketId, run) => local.submitResult(ticketId, run),
    getBoard: (level) => local.getBoard(level),
  };
}
