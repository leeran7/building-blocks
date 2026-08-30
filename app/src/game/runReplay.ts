/**
 * Tower v3 "The Climb" — deterministic run replay encoding.
 *
 * Each live run records one packed input byte per sim tick. The payload is
 * deflate-compressed and base64url-encoded so a finished run can be shared as a
 * single /play?r=… link without server storage.
 */

import { PlayerInput } from "./types";

export const REPLAY_VERSION = 1;
/** Longest run we will encode into a share link (~10 minutes). */
export const MAX_SHARE_TICKS = 18_000;

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

export function packInputLog(inputs: PlayerInput[]): Uint8Array {
  const out = new Uint8Array(inputs.length);
  for (let i = 0; i < inputs.length; i++) out[i] = packInput(inputs[i]);
  return out;
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

/** Decode a share-link token back into a replay, or null if invalid. */
export async function decodeRunReplay(token: string): Promise<RunReplay | null> {
  try {
    const json = new TextDecoder().decode(base64UrlDecode(token));
    const raw = JSON.parse(json) as {
      v?: unknown;
      s?: unknown;
      p?: unknown;
      i?: unknown;
    };
    if (raw.v !== REPLAY_VERSION) return null;
    if (typeof raw.s !== "string" || !raw.s) return null;
    if (typeof raw.p !== "number" || !Number.isFinite(raw.p)) return null;
    if (typeof raw.i !== "string" || !raw.i) return null;
    const bytes = await inflate(base64UrlToBytes(raw.i));
    const inputs = unpackInputLog(bytes);
    if (inputs.length === 0 || inputs.length > MAX_SHARE_TICKS) return null;
    return { version: REPLAY_VERSION, seed: raw.s, peakY: raw.p, inputs };
  } catch {
    return null;
  }
}

/** Build the full share URL for a replay token on the current origin. */
export function buildReplayUrl(token: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/play?r=${token}`;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") return bytes;
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") return bytes;
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
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
