/**
 * RV-DC-2: a runtime with no CompressionStream (iOS WebViews 15.0-16.3, which
 * the app supports) writes the packed input bytes uncompressed. Every decoder
 * must accept that raw form, keep it apart from deflate, and keep SEC-DC-1:
 * the output is bounded and the cheap checks run first.
 */

import { deflateSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  decodeRunReplay,
  encodeRunReplay,
  isPackedInputByte,
  MAX_REPLAY_TOKEN_LENGTH,
  MAX_SHARE_TICKS,
  packInput,
  packInputLog,
  parseReplayToken,
  parseRunReplayEnvelope,
  replayLogEncoding,
} from "../../src/game/runReplay";
import { decodeRunReplayServer } from "../../src/game/runReplayServer";
import type { PlayerInput } from "../../src/game/types";

const SEED = "daily1-AbCdEfGhIjKlMnOpQrSt_-";

/** Every input packInput can see (usePowerUp is not packed). */
const ALL_INPUTS: PlayerInput[] = [];
for (const moveX of [-1, 0, 1] as const)
  for (const jump of [false, true])
    for (const climbY of [-1, 0, 1] as const) ALL_INPUTS.push({ moveX, jump, climbY, usePowerUp: false });
const PACKED = [...new Set(ALL_INPUTS.map(packInput))];

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
/** A token whose input-log field is exactly `bytes` (no compression). */
function tokenWithLog(bytes: Uint8Array): string {
  return b64url(Buffer.from(JSON.stringify({ v: 1, s: SEED, p: 3, i: b64url(bytes) })));
}
const logOf = (n: number): PlayerInput[] => Array.from({ length: n }, (_, i) => ALL_INPUTS[(i * 7) % ALL_INPUTS.length]);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the raw and deflate forms cannot be confused", () => {
  it("precondition: there are 18 distinct packed bytes, and all pass isPackedInputByte", () => {
    expect(PACKED).toHaveLength(18);
    expect(PACKED.every(isPackedInputByte)).toBe(true);
  });

  it("no pair of packed bytes reads as a zlib header (exhaustive)", () => {
    let checked = 0;
    for (const a of PACKED) {
      for (const b of PACKED) {
        expect(replayLogEncoding(Uint8Array.of(a, b))).toBe("raw");
        checked++;
      }
    }
    expect(checked).toBe(18 * 18);
  });

  it("zlib output always reads as deflate, at every level", () => {
    let checked = 0;
    for (const level of [0, 1, 6, 9]) {
      for (const n of [1, 2, 50, 3000]) {
        expect(replayLogEncoding(deflateSync(packInputLog(logOf(n)), { level }))).toBe("deflate");
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("rejects bytes that are neither form: an unpackable byte anywhere, or nothing", () => {
    let checked = 0;
    for (const bad of [3, 0x18, 0x20, 0xff]) {
      const bytes = packInputLog(logOf(40));
      bytes[17] = bad;
      expect(replayLogEncoding(bytes)).toBeNull();
      checked++;
    }
    expect(checked).toBe(4);
    expect(replayLogEncoding(new Uint8Array(0))).toBeNull();
    // Over the cap is neither form, whatever the bytes (checked before the scan).
    expect(replayLogEncoding(packInputLog(logOf(MAX_SHARE_TICKS + 1)))).toBeNull();
    expect(replayLogEncoding(packInputLog(logOf(MAX_SHARE_TICKS)))).toBe("raw");
    // Positive control: the same log without the bad byte is raw.
    expect(replayLogEncoding(packInputLog(logOf(40)))).toBe("raw");
  });
});

describe("a token from a runtime with no CompressionStream", () => {
  it("encodes raw, and both the server and the browser decoder read it back exactly", async () => {
    vi.stubGlobal("CompressionStream", undefined);
    const inputs = logOf(900);
    const token = await encodeRunReplay({ seed: SEED, peakY: 12, inputs });
    expect(token).toBeTruthy();
    const envelope = parseRunReplayEnvelope(token!);
    // Precondition: the client really sent the packed bytes uncompressed.
    expect(Buffer.from(envelope!.compressed).equals(Buffer.from(packInputLog(inputs)))).toBe(true);

    const expected = inputs.map((i) => ({ ...i, usePowerUp: false }));
    expect(decodeRunReplayServer(token!)?.inputs).toEqual(expected);
    vi.unstubAllGlobals();
    expect((await decodeRunReplay(token!))?.inputs).toEqual(expected);
  });

  it("control: the same run from a runtime WITH CompressionStream decodes to the same inputs", async () => {
    const inputs = logOf(900);
    const token = await encodeRunReplay({ seed: SEED, peakY: 12, inputs });
    expect(replayLogEncoding(parseRunReplayEnvelope(token!)!.compressed)).toBe("deflate");
    expect(decodeRunReplayServer(token!)?.inputs).toEqual(inputs.map((i) => ({ ...i, usePowerUp: false })));
  });
});

describe("the raw form keeps the SEC-DC-1 output bound", () => {
  it("accepts exactly MAX_SHARE_TICKS raw bytes and refuses one more, on both decoders", async () => {
    const atCap = tokenWithLog(packInputLog(logOf(MAX_SHARE_TICKS)));
    const over = tokenWithLog(packInputLog(logOf(MAX_SHARE_TICKS + 1)));
    expect(decodeRunReplayServer(atCap)?.inputs).toHaveLength(MAX_SHARE_TICKS);
    expect(decodeRunReplayServer(over)).toBeNull();
    expect((await decodeRunReplay(atCap))?.inputs).toHaveLength(MAX_SHARE_TICKS);
    expect(await decodeRunReplay(over)).toBeNull();
  });

  it("the largest raw token the length allow-list admits is refused on length, before any byte scan", () => {
    // Base64 twice leaves room for only a little over MAX_SHARE_TICKS raw bytes
    // under MAX_REPLAY_TOKEN_LENGTH; take the largest such log.
    let n = MAX_SHARE_TICKS + 1;
    while (tokenWithLog(packInputLog(logOf(n + 1))).length <= MAX_REPLAY_TOKEN_LENGTH) n++;
    expect(n).toBeGreaterThan(MAX_SHARE_TICKS);
    const bytes = packInputLog(logOf(n));
    const token = tokenWithLog(bytes);
    expect(parseReplayToken(token)).toBe(token);
    expect(token.length).toBeLessThanOrEqual(MAX_REPLAY_TOKEN_LENGTH);
    // A bad byte past the cap would be found by a scan; the length check wins first.
    bytes[bytes.length - 1] = 0xff;
    const start = performance.now();
    expect(decodeRunReplayServer(tokenWithLog(bytes))).toBeNull();
    expect(performance.now() - start).toBeLessThan(100);
  });

  it("a deflate bomb is still refused (deflate header -> capped inflate, never read as raw)", () => {
    const bomb = deflateSync(Buffer.alloc(2_000_000, packInput(ALL_INPUTS[4])), { level: 9 });
    expect(replayLogEncoding(bomb)).toBe("deflate");
    expect(decodeRunReplayServer(tokenWithLog(bomb))).toBeNull();
  });

  it("deflate bytes that fail to inflate are rejected, not reinterpreted as raw", async () => {
    const good = deflateSync(packInputLog(logOf(200)));
    const corrupt = Uint8Array.from(good);
    corrupt[corrupt.length - 3] ^= 0xff; // break the Adler-32 trailer
    expect(replayLogEncoding(corrupt)).toBe("deflate");
    expect(decodeRunReplayServer(tokenWithLog(corrupt))).toBeNull();
    expect(await decodeRunReplay(tokenWithLog(corrupt))).toBeNull();
    // Positive control.
    expect(decodeRunReplayServer(tokenWithLog(good))?.inputs).toHaveLength(200);
  });

  it("a browser with no DecompressionStream refuses a deflate token instead of unpacking compressed bytes", async () => {
    const token = await encodeRunReplay({ seed: SEED, peakY: 12, inputs: logOf(300) });
    vi.stubGlobal("DecompressionStream", undefined);
    expect(await decodeRunReplay(token!)).toBeNull();
  });
});
