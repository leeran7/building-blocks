/**
 * Tower v3 "The Climb" — deterministic run replay encoding.
 *
 * Each live run records one packed input byte per sim tick. The payload is
 * deflate-compressed and base64url-encoded so a finished run can be shared as a
 * single /play?r=… link without server storage.
 *
 * A runtime with no CompressionStream (iOS WebViews before 16.4) stores the
 * packed bytes as they are. Every decoder tells the two forms apart the same
 * way (replayLogEncoding): the forms cannot overlap, and a raw log is never
 * longer than MAX_SHARE_TICKS, so accepting it keeps the output bound
 * (RV-DC-2, SEC-DC-1).
 */

import { PlayerInput } from "./types";

export const REPLAY_VERSION = 1;
/** Longest run we will encode into a share link (~10 minutes). */
export const MAX_SHARE_TICKS = 18_000;
/** Max encoded token length accepted by the server. */
export const MAX_REPLAY_TOKEN_LENGTH = 32_768;

export interface RunReplay {
  version: typeof REPLAY_VERSION;
  seed: string;
  peakY: number;
  inputs: PlayerInput[];
}

/** Pack a PlayerInput into a single byte (moveX, jump, climbY). */
export function packInput(input: PlayerInput): number {
  const move = input.moveX + 1;
  const jump = input.jump ? 1 : 0;
  const climb = input.climbY + 1;
  return move | (jump << 2) | (climb << 3);
}

/** Unpack a byte back into a PlayerInput. */
export function unpackInput(byte: number): PlayerInput {
  const moveX = ((byte & 3) - 1) as -1 | 0 | 1;
  const jump = Boolean((byte >> 2) & 1);
  const climbY = (((byte >> 3) & 3) - 1) as -1 | 0 | 1;
  return { moveX, jump, climbY, usePowerUp: false };
}

/**
 * Whether `byte` is something packInput can produce: bits 5-7 clear, and
 * neither the move field (bits 0-1) nor the climb field (bits 3-4) is 3.
 */
export function isPackedInputByte(byte: number): boolean {
  return byte >= 0 && byte < 32 && (byte & 3) !== 3 && ((byte >> 3) & 3) !== 3;
}

/** How a replay envelope stores its input log. */
export type ReplayLogEncoding = "deflate" | "raw";

/**
 * Which form a replay's input-log bytes are in, or null when they are neither
 * (never guessed).
 *
 * - "deflate": the bytes start with a valid RFC 1950 (zlib) header, as
 *   CompressionStream("deflate") and zlib.deflateSync write. Such bytes are
 *   never read as raw: if they fail to inflate, the token is rejected.
 * - "raw": 1..MAX_SHARE_TICKS bytes, every one a packed input byte. This is
 *   what encodeRunReplay writes with no CompressionStream. The length is
 *   checked before the bytes are scanned, and the output is the input, so it
 *   is bounded like a capped inflate.
 *
 * The forms cannot overlap. A zlib header's first byte (CMF) has 8 in its
 * low nibble. The only such byte that is also a packed input byte is 0x08
 * (0x18 has climb field 3; 0x28 and up exceed 31). With CMF 0x08, the header
 * check needs FLG = 29 (mod 31), and the only candidate under 32 is 0x1D,
 * whose climb field is 3. So no packed log starts with a valid zlib header.
 */
export function replayLogEncoding(bytes: Uint8Array): ReplayLogEncoding | null {
  if (bytes.length >= 2) {
    const cmf = bytes[0];
    const flg = bytes[1];
    if ((cmf & 0x0f) === 8 && cmf >> 4 <= 7 && ((cmf << 8) | flg) % 31 === 0) return "deflate";
  }
  if (bytes.length === 0 || bytes.length > MAX_SHARE_TICKS) return null;
  for (let i = 0; i < bytes.length; i++) {
    if (!isPackedInputByte(bytes[i])) return null;
  }
  return "raw";
}

export function packInputLog(inputs: PlayerInput[]): Uint8Array {
  const out = new Uint8Array(inputs.length);
  for (let i = 0; i < inputs.length; i++) out[i] = packInput(inputs[i]);
  return out;
}

/**
 * Pack, deflate-compress, and standard-base64-encode an input log for POSTing
 * to /api/duel/[id]/result. The server decompresses with zlib.inflateSync
 * (RFC 1950 / zlib format), which matches CompressionStream("deflate").
 */
export async function packAndEncodeInputLog(inputs: PlayerInput[]): Promise<string> {
  const packed = packInputLog(inputs);
  const compressed = await deflate(packed);
  let binary = "";
  for (let i = 0; i < compressed.length; i++) binary += String.fromCharCode(compressed[i]);
  return btoa(binary);
}

export function unpackInputLog(bytes: Uint8Array): PlayerInput[] {
  const out: PlayerInput[] = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = unpackInput(bytes[i]);
  return out;
}

export interface EncodeRunReplayInput {
  seed: string;
  peakY: number;
  inputs: PlayerInput[];
}

/**
 * Encode a finished run for a share URL. Returns null when the log is empty or
 * too long to share safely in a query string.
 */
export async function encodeRunReplay(
  run: EncodeRunReplayInput
): Promise<string | null> {
  if (run.inputs.length === 0 || run.inputs.length > MAX_SHARE_TICKS) return null;
  const compressed = await deflate(packInputLog(run.inputs));
  const payload = JSON.stringify({
    v: REPLAY_VERSION,
    s: run.seed,
    p: Math.round(run.peakY * 10) / 10,
    i: bytesToBase64Url(compressed),
  });
  return base64UrlEncode(new TextEncoder().encode(payload));
}

/**
 * A replay token's JSON envelope, with the input log still compressed. Parsing
 * it costs no inflate, so callers can run cheap checks (the seed's day, rate
 * limits) before paying for decompression.
 */
export interface RunReplayEnvelope {
  version: typeof REPLAY_VERSION;
  seed: string;
  peakY: number;
  compressed: Uint8Array;
}

/** Parse a token's envelope without inflating the input log; null if malformed. */
export function parseRunReplayEnvelope(token: string): RunReplayEnvelope | null {
  try {
    const json = new TextDecoder().decode(base64UrlDecode(token));
    const raw = JSON.parse(json) as {
      v?: unknown;
      s?: unknown;
      p?: unknown;
      i?: unknown;
    };
    if (typeof raw !== "object" || raw === null) return null;
    if (raw.v !== REPLAY_VERSION) return null;
    if (typeof raw.s !== "string" || !raw.s) return null;
    if (typeof raw.p !== "number" || !Number.isFinite(raw.p)) return null;
    if (typeof raw.i !== "string" || !raw.i) return null;
    return { version: REPLAY_VERSION, seed: raw.s, peakY: raw.p, compressed: base64UrlToBytes(raw.i) };
  } catch {
    return null;
  }
}

/**
 * Turn an envelope plus its inflated input bytes into a replay. The length is
 * checked BEFORE unpacking, which allocates one object per byte.
 */
export function replayFromInflated(envelope: RunReplayEnvelope, bytes: Uint8Array): RunReplay | null {
  if (bytes.length === 0 || bytes.length > MAX_SHARE_TICKS) return null;
  return { version: REPLAY_VERSION, seed: envelope.seed, peakY: envelope.peakY, inputs: unpackInputLog(bytes) };
}

/**
 * Decode a share-link token back into a replay, or null if invalid. Runs in
 * the browser and in Node; the inflate stops as soon as the output passes
 * MAX_SHARE_TICKS bytes. Server routes use decodeRunReplayServer
 * (runReplayServer.ts), which caps zlib's output the same way.
 */
export async function decodeRunReplay(token: string): Promise<RunReplay | null> {
  const envelope = parseRunReplayEnvelope(token);
  if (!envelope) return null;
  const encoding = replayLogEncoding(envelope.compressed);
  if (encoding === null) return null;
  if (encoding === "raw") return replayFromInflated(envelope, envelope.compressed);
  try {
    const bytes = await inflateCapped(envelope.compressed, MAX_SHARE_TICKS);
    return bytes ? replayFromInflated(envelope, bytes) : null;
  } catch {
    return null;
  }
}

/**
 * Allow-list a replay token from an untrusted request body: a non-empty
 * string within MAX_REPLAY_TOKEN_LENGTH after trimming, else null. Shape only
 * — decodeRunReplay decides whether it is a real replay.
 */
export function parseReplayToken(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_REPLAY_TOKEN_LENGTH) return null;
  return trimmed;
}

/** Build the full share URL for a replay token on the current origin. */
export function buildReplayUrl(token: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/play?r=${token}`;
}

/** Build the shareable watch URL for a completed duel replay. */
export function buildDuelWatchUrl(duelId: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/duel/${duelId}/watch`;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") return bytes;
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Inflate at most `maxBytes` of output. Reads the stream chunk by chunk and
 * cancels it once the output passes the cap, so a small token that expands
 * ~1000x (a decompression bomb) costs one chunk, not the whole expansion.
 * Null when the output would exceed the cap.
 */
async function inflateCapped(bytes: Uint8Array, maxBytes: number): Promise<Uint8Array | null> {
  // Deflated bytes cannot be read without a decoder (never unpack them as-is).
  if (typeof DecompressionStream === "undefined") return null;
  const reader = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"))
    .getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(encoded: string): Uint8Array {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + "=".repeat(pad));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function base64UrlEncode(bytes: Uint8Array): string {
  return bytesToBase64Url(bytes);
}

function base64UrlDecode(token: string): Uint8Array {
  return base64UrlToBytes(token);
}
