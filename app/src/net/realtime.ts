"use client";

/**
 * Ably client wrapper for duel mode.
 * All realtime I/O goes through this module — the hook and components
 * never import Ably directly.
 *
 * connectRealtime() fetches a capability token from /api/realtime/token,
 * opens an Ably Realtime connection scoped to the duel channel, and
 * returns a typed handle with pub/sub helpers for inputs, control events,
 * and presence.
 */

// Ably is imported dynamically inside connectRealtime() to prevent the
// Next.js flight-client-module-loader from statically tracing into ably.js
// on the server webpack pass (its arrow-function-super pattern causes a parse
// error under next-swc-loader).
import type Ably from "ably";
import { auth } from "../lib/firebase";
import { PlayerInput } from "../game/types";

export type DuelEvent = "ready" | "start" | "forfeit" | "rematch";

export interface RealtimeInputMessage {
  tick: number;
  input: PlayerInput;
}

export interface RealtimeEventMessage {
  type: DuelEvent;
  slot?: number;
  reason?: string;
  newDuelId?: string;
  serverTimestamp?: number;
}

export interface RealtimeHandle {
  /** Publish an input frame tagged for tick T+INPUT_DELAY. */
  publishInput(tick: number, input: PlayerInput): void;
  /** Register a callback for incoming peer input frames. */
  onInput(cb: (msg: RealtimeInputMessage) => void): () => void;
  /** Publish a control event (ready, start, forfeit, rematch). */
  publishEvent(msg: RealtimeEventMessage): void;
  /** Register a callback for control events. */
  onEvent(type: DuelEvent, cb: (msg: RealtimeEventMessage) => void): () => void;
  /** Ably presence: enter with client data. */
  enterPresence(data: { uid: string; displayName: string; slot: number }): void;
  /** Subscribe to presence changes. */
  onPresence(cb: (action: string, member: { clientId: string; data: unknown }) => void): () => void;
  /** Get current presence members. */
  getPresence(): Promise<{ clientId: string; data: unknown }[]>;
  /**
   * Subscribe to connection-state changes so the UI can show "reconnecting"
   * during a blip instead of a silent freeze. Fires with Ably state strings
   * (connected, disconnected, suspended, closed, failed…).
   */
  onConnectionState(cb: (state: string) => void): () => void;
  /** Clean up the connection. */
  dispose(): void;
}

/**
 * Fetch a Firebase ID token for the Authorization header, if the user is
 * signed in. Returns null for anonymous / unauthenticated callers.
 */
async function getFirebaseToken(): Promise<string | null> {
  try {
    const user = auth.currentUser;
    if (!user) return null;
    return await user.getIdToken();
  } catch {
    return null;
  }
}

/**
 * Fetch an Ably token request from /api/realtime/token with exponential
 * backoff. Returns the token request object on success, throws on final
 * failure.
 */
async function fetchAblyToken(
  duelId: string,
  guestId: string | null,
  retry = true
): Promise<Ably.TokenRequest> {
  const delays = retry ? [500, 1000, 2000] : [];
  let lastError: unknown;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const firebaseToken = await getFirebaseToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (firebaseToken) {
        headers["Authorization"] = `Bearer ${firebaseToken}`;
      }

      const res = await fetch("/api/realtime/token", {
        method: "POST",
        headers,
        body: JSON.stringify({ duelId, ...(guestId ? { guestId } : {}) }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(`Token fetch failed: ${res.status} ${body.error ?? ""}`);
      }

      return (await res.json()) as Ably.TokenRequest;
    } catch (err) {
      lastError = err;
      if (attempt < delays.length) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
    }
  }

  throw lastError;
}

/**
 * Initialize an Ably Realtime connection for a specific duel.
 * Fetches a capability token from /api/realtime/token.
 * Returns a handle with typed pub/sub helpers.
 */
export async function connectRealtime(
  duelId: string,
  clientId: string,
  guestId: string | null = null
): Promise<RealtimeHandle> {
  const tokenRequest = await fetchAblyToken(duelId, guestId);

  // Dynamic import so ably is code-split into a browser-only chunk (this module
  // is "use client"; the page loads it via DuelRoomLoader's ssr:false dynamic
  // import, so the server bundle never evaluates it). ably's build output uses an
  // arrow-function-super pattern SWC can't parse — the babel-loader rule in
  // next.config.js downcompiles it, and serverExternalPackages keeps it off the
  // RSC pass. (No webpackIgnore: that left the browser with an unresolved bare
  // "ably" specifier — "does not resolve to a valid URL".)
  const AblyModule = await import("ably");
  const AblyRealtime =
    (AblyModule as { default?: { Realtime: typeof AblyModule.Realtime } }).default?.Realtime ??
    AblyModule.Realtime;

  let firstAuth = true;
  const ably = new AblyRealtime({
    tokenDetails: undefined,
    // Reuse the pre-fetched token request for the initial auth, then fetch a
    // FRESH one on every subsequent demand (renewal / reconnect). Returning the
    // same stale request would make Ably reject the renewal and fail the
    // connection mid-session. Keep this fast (no retry) so Ably's own retry
    // strategy stays in control.
    authCallback: (_tokenParams, callback) => {
      if (firstAuth) {
        firstAuth = false;
        callback(null, tokenRequest);
        return;
      }
      fetchAblyToken(duelId, guestId, false)
        .then((fresh) => callback(null, fresh))
        .catch((err) => callback(err as string, null));
    },
    clientId,
  });

  // Wait for connection
  await new Promise<void>((resolve, reject) => {
    if (ably.connection.state === "connected") {
      resolve();
      return;
    }
    ably.connection.once("connected", () => resolve());
    ably.connection.once("failed", (stateChange) =>
      reject(new Error(`Ably connection failed: ${stateChange.reason?.message ?? "unknown"}`))
    );
  });

  const channel = ably.channels.get(`duel:${duelId}`);

  const handle: RealtimeHandle = {
    publishInput(tick, input) {
      channel.publish("input", { tick, input }).catch(() => {
        // Fire-and-forget — stall detection handles the consequence
      });
    },

    onInput(cb) {
      const handler = (msg: Ably.Message) => {
        const data = msg.data as RealtimeInputMessage;
        if (typeof data?.tick === "number" && data.input) {
          cb(data);
        }
      };
      channel.subscribe("input", handler);
      return () => channel.unsubscribe("input", handler);
    },

    publishEvent(msg) {
      channel.publish("event", msg).catch(() => {
        // Fire-and-forget
      });
    },

    onEvent(type, cb) {
      const handler = (msg: Ably.Message) => {
        const data = msg.data as RealtimeEventMessage;
        if (data?.type === type) {
          cb(data);
        }
      };
      channel.subscribe("event", handler);
      return () => channel.unsubscribe("event", handler);
    },

    enterPresence(data) {
      channel.presence.enter(data).catch(() => {
        // Best effort
      });
    },

    onPresence(cb) {
      const handler = (member: Ably.PresenceMessage) => {
        cb(member.action, { clientId: member.clientId, data: member.data });
      };
      channel.presence.subscribe(handler);
      return () => channel.presence.unsubscribe(handler);
    },

    async getPresence() {
      const members = await channel.presence.get();
      return members.map((m) => ({ clientId: m.clientId, data: m.data }));
    },

    onConnectionState(cb) {
      const handler = (stateChange: Ably.ConnectionStateChange) => {
        cb(stateChange.current);
      };
      ably.connection.on(handler);
      // Emit the current state immediately so a subscriber that mounts after a
      // drop doesn't sit on a stale "connected" default.
      cb(ably.connection.state);
      return () => ably.connection.off(handler);
    },

    dispose() {
      channel.presence.leave().catch(() => {});
      ably.close();
    },
  };

  return handle;
}
