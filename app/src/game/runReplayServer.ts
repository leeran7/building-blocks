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
  replayLogEncoding,
  type RunReplay,
  type RunReplayEnvelope,
} from "./runReplay";

/**
 * Read an envelope's input log with the output capped at MAX_SHARE_TICKS
 * bytes (one byte per tick). A deflated log is inflated by zlib with that
 * cap. A raw log (a client with no CompressionStream, e.g. iOS < 16.4) is
 * accepted as-is once replayLogEncoding has checked its length (at most
 * MAX_SHARE_TICKS) and that every byte is a packed input (RV-DC-2). Null when
 * the data is neither, is corrupt, or would exceed the cap.
 */
export function inflateReplayEnvelope(envelope: RunReplayEnvelope): RunReplay | null {
  const encoding = replayLogEncoding(envelope.compressed);
  if (encoding === null) return null;
  if (encoding === "raw") return replayFromInflated(envelope, envelope.compressed);
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
