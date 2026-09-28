import { LevelsApiError } from "./httpClient";
import type { LevelsClient } from "./model";

/**
 * The server client, falling back to the device-local mock while the level
 * routes are not deployed on the server the app talks to (the Level System
 * is play-tested on its feature branch before it reaches production).
 *
 * Only a 404 with no error code counts: that is the route itself missing. A
 * level API error (a code in the body), a network failure or a 5xx stays an
 * error, so a real outage never silently swaps a player onto local data.
 * The choice is made on the season load, before any ticket is issued, and
 * holds for the life of the client.
 */
export function withMockFallback(server: LevelsClient, mock: () => LevelsClient): LevelsClient {
  let active: LevelsClient = server;
  return {
    async getSeason() {
      if (active !== server) return active.getSeason();
      try {
        return await server.getSeason();
      } catch (err) {
        if (!(err instanceof LevelsApiError && err.status === 404 && err.code === null)) throw err;
        active = mock();
        return active.getSeason();
      }
    },
    startLevel: (level) => active.startLevel(level),
    submitResult: (ticketId, run) => active.submitResult(ticketId, run),
  };
}
