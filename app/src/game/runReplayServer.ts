/**
 * Server-only replay decoding for untrusted tokens (route handlers, the social
 * replay analysis). Node's zlib stops at `maxOutputLength` and throws, so a
 * decompression bomb costs at most MAX_SHARE_TICKS bytes of output. This is
 * the same pattern as the duel result and replay routes. Never import this
 * from client code: it depends on node:zlib.
 */

import zlib from "node:zlib";

import {
  MAX_SHARE_TICKS,
  parseRunReplayEnvelope,
  replayFromInflated,
  type RunReplay,
  type RunReplayEnvelope,
} from "./runReplay";

/**
 * Inflate an envelope's input log with the output capped at MAX_SHARE_TICKS
 * bytes (one byte per tick). Null when the data is corrupt or would exceed
 * the cap.
 */
export function inflateReplayEnvelope(envelope: RunReplayEnvelope): RunReplay | null {
  let bytes: Buffer;
  try {
    bytes = zlib.inflateSync(envelope.compressed, { maxOutputLength: MAX_SHARE_TICKS });
  } catch {
    return null;
  }
  return replayFromInflated(envelope, bytes);
}

/** Decode a replay token on the server, or null if it is malformed or too long. */
export function decodeRunReplayServer(token: string): RunReplay | null {
  const envelope = parseRunReplayEnvelope(token);
  return envelope ? inflateReplayEnvelope(envelope) : null;
}
