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
async function fetchAblyToken(duelId: string): Promise<Ably.TokenRequest> {
  const delays = [500, 1000, 2000];
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
        body: JSON.stringify({ duelId }),
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
  clientId: string
): Promise<RealtimeHandle> {
  const tokenRequest = await fetchAblyToken(duelId);

  // webpackIgnore prevents webpack from statically analysing this import, so
  // the next-flight-client-module-loader never walks into ably's build output
  // (which contains an arrow-function-super pattern that SWC cannot parse).
  // At runtime in the browser this resolves normally via the bundle's module map.
  const AblyModule = await import(/* webpackIgnore: true */ "ably");
  const AblyRealtime =
    (AblyModule as { default?: { Realtime: typeof AblyModule.Realtime } }).default?.Realtime ??
    AblyModule.Realtime;

  const ably = new AblyRealtime({
    tokenDetails: undefined,
    // Pass the token request directly so Ably uses it to obtain a token.
    authCallback: (_tokenParams, callback) => {
      callback(null, tokenRequest);
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

    dispose() {
      channel.presence.leave().catch(() => {});
      ably.close();
    },
  };

  return handle;
}
