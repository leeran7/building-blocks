/**
 * SEC-DC-1: a replay token is untrusted input, and MAX_REPLAY_TOKEN_LENGTH
 * caps only the COMPRESSED size. A token of all-same bytes at deflate level 9
 * stays under that cap but inflates ~1000x, so every decode path has to cap
 * its OUTPUT and reject on length before it builds one object per byte.
 *
 * The bomb is ~18.9 MB of input bytes in a token at the length cap. Before the
 * fix, decodeRunReplay took ~15 s and ~1.3 GB to return null.
 */

import zlib, { deflateSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

import {
  decodeRunReplay,
  encodeRunReplay,
  MAX_REPLAY_TOKEN_LENGTH,
  MAX_SHARE_TICKS,
  parseReplayToken,
  parseRunReplayEnvelope,
  replayFromInflated,
} from "../../src/game/runReplay";
import { decodeRunReplayServer } from "../../src/game/runReplayServer";
import { analyzeClimbReplay } from "../../src/social/services/replayAnalysis";

const SEED = "daily-2026-09-26";
/** Input bytes that fit the largest bomb under MAX_REPLAY_TOKEN_LENGTH. */
const BOMB_BYTES = 18_900_000;
/** Generous for CI; a capped decode takes a few ms, the old one ~15 s. */
const DECODE_BUDGET_MS = 1_000;
/** Resident growth allowed across one decode; the old decoder grew ~1.3 GB. */
const RSS_BUDGET_BYTES = 128 * 1024 * 1024;
/** A valid packed input byte (moveX 0, no jump, climbY 0). */
const IDLE_INPUT = 0b01001;

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A replay token whose input log is `count` copies of one valid byte. */
function tokenFor(count: number): string {
  const compressed = deflateSync(Buffer.alloc(count, IDLE_INPUT), { level: 9 });
  return b64url(Buffer.from(JSON.stringify({ v: 1, s: SEED, p: 1, i: b64url(compressed) })));
}

async function timed<T>(run: () => Promise<T> | T): Promise<{ value: T; ms: number; rssGrowth: number }> {
  const rss = process.memoryUsage().rss;
  const start = performance.now();
  const value = await run();
  return { value, ms: performance.now() - start, rssGrowth: process.memoryUsage().rss - rss };
}

const bomb = tokenFor(BOMB_BYTES);

describe("replay decode caps its output (SEC-DC-1)", () => {
  it("precondition: the bomb passes the token-length allow-list", () => {
    expect(bomb.length).toBeLessThanOrEqual(MAX_REPLAY_TOKEN_LENGTH);
    expect(bomb.length).toBeGreaterThan(MAX_REPLAY_TOKEN_LENGTH * 0.99);
    expect(parseReplayToken(bomb)).toBe(bomb);
  });

  it("decodeRunReplay rejects the bomb within a tight time and memory bound", async () => {
    const { value, ms, rssGrowth } = await timed(() => decodeRunReplay(bomb));
    expect(value).toBeNull();
    expect(ms).toBeLessThan(DECODE_BUDGET_MS);
    expect(rssGrowth).toBeLessThan(RSS_BUDGET_BYTES);
  }, 60_000);

  it("the browser decoder stops pulling from DecompressionStream soon after the cap", async () => {
    const Real = globalThis.DecompressionStream;
    let pulled = 0;
    class Counting {
      readonly writable: WritableStream<BufferSource>;
      readonly readable: ReadableStream<Uint8Array>;
      constructor(format: CompressionFormat) {
        const inner = new Real(format);
        this.writable = inner.writable;
        this.readable = inner.readable.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              pulled += chunk.length;
              controller.enqueue(chunk);
            },
          }),
        );
      }
    }
    vi.stubGlobal("DecompressionStream", Counting);
    try {
      expect(await decodeRunReplay(bomb)).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(pulled).toBeGreaterThan(MAX_SHARE_TICKS);
    // A few stream chunks past the cap, not the ~18.9 MB expansion.
    expect(pulled).toBeLessThan(1024 * 1024);
  });

  it("replayFromInflated rejects on length before unpacking", () => {
    const envelope = parseRunReplayEnvelope(tokenFor(10));
    expect(envelope).not.toBeNull();
    expect(replayFromInflated(envelope!, new Uint8Array(MAX_SHARE_TICKS + 1).fill(IDLE_INPUT))).toBeNull();
    expect(replayFromInflated(envelope!, new Uint8Array(0))).toBeNull();
    expect(replayFromInflated(envelope!, new Uint8Array(MAX_SHARE_TICKS).fill(IDLE_INPUT))?.inputs).toHaveLength(
      MAX_SHARE_TICKS,
    );
  });

  it("positive control: exactly MAX_SHARE_TICKS inputs decode; one more is rejected", async () => {
    const atCap = await decodeRunReplay(tokenFor(MAX_SHARE_TICKS));
    expect(atCap?.inputs).toHaveLength(MAX_SHARE_TICKS);
    expect(atCap?.seed).toBe(SEED);
    expect(await decodeRunReplay(tokenFor(MAX_SHARE_TICKS + 1))).toBeNull();
  });

  it("decodeRunReplayServer (zlib maxOutputLength) rejects the bomb within the same bound", async () => {
    const { value, ms, rssGrowth } = await timed(() => decodeRunReplayServer(bomb));
    expect(value).toBeNull();
    expect(ms).toBeLessThan(DECODE_BUDGET_MS);
    expect(rssGrowth).toBeLessThan(RSS_BUDGET_BYTES);
  }, 60_000);

  it("the server inflate never materializes more than MAX_SHARE_TICKS bytes of a bomb", () => {
    const produced: number[] = [];
    const real = zlib.inflateSync;
    const spy = vi.spyOn(zlib, "inflateSync").mockImplementation((...args: Parameters<typeof real>) => {
      const out = real(...args);
      produced.push(out.length);
      return out;
    });
    try {
      expect(decodeRunReplayServer(bomb)).toBeNull();
      expect(spy).toHaveBeenCalledTimes(1);
      // The capped inflate throws instead of returning the expansion.
      expect(produced.every((n) => n <= MAX_SHARE_TICKS)).toBe(true);
      expect(produced).toEqual([]);
      // Just over the cap: still thrown inside zlib, never returned and checked later.
      expect(decodeRunReplayServer(tokenFor(MAX_SHARE_TICKS + 1))).toBeNull();
      expect(produced.every((n) => n <= MAX_SHARE_TICKS)).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("positive control (server): exactly MAX_SHARE_TICKS inputs decode; one more is rejected", () => {
    const atCap = decodeRunReplayServer(tokenFor(MAX_SHARE_TICKS));
    expect(atCap?.inputs).toHaveLength(MAX_SHARE_TICKS);
    expect(atCap?.inputs[0]).toEqual({ moveX: 0, jump: false, climbY: 0, usePowerUp: false });
    expect(decodeRunReplayServer(tokenFor(MAX_SHARE_TICKS + 1))).toBeNull();
  });

  it("the server decoder reads the browser encoder's tokens", async () => {
    const inputs = Array.from({ length: 300 }, (_, i) => ({
      moveX: ((i % 3) - 1) as -1 | 0 | 1,
      jump: i % 7 === 0,
      climbY: 1 as const,
      usePowerUp: false,
    }));
    const token = await encodeRunReplay({ seed: SEED, peakY: 4.2, inputs });
    expect(token).not.toBeNull();
    const decoded = decodeRunReplayServer(token!);
    expect(decoded).toEqual({ version: 1, seed: SEED, peakY: 4.2, inputs });
    expect(await decodeRunReplay(token!)).toEqual(decoded);
  });

  it("the social replay analysis rejects the bomb within the same bound", async () => {
    const start = performance.now();
    await expect(analyzeClimbReplay(`https://doomstack.lol/play?r=${bomb}`)).rejects.toThrow(/decode/i);
    expect(performance.now() - start).toBeLessThan(DECODE_BUDGET_MS);
  }, 60_000);

  it("the social replay analysis refuses an over-length token lifted from a link", async () => {
    const long = "A".repeat(MAX_REPLAY_TOKEN_LENGTH + 1);
    await expect(analyzeClimbReplay(`https://doomstack.lol/play?r=${long}`)).rejects.toThrow(/Invalid replay/);
  });
});

describe("social replay analysis caps decode output (SEC-DC-1 / SEC-DC-8, verifier)", () => {
  /**
   * Runs `fn` while counting every decompressed byte the process materializes,
   * through zlib.inflateSync (returned buffers) and DecompressionStream (pulled
   * chunks). Whichever decoder the analysis uses, the count sees it.
   */
  async function countInflated<T>(fn: () => Promise<T>): Promise<{ result: PromiseSettledResult<T>; bytes: number }> {
    let bytes = 0;
    const real = zlib.inflateSync;
    const spy = vi.spyOn(zlib, "inflateSync").mockImplementation((...args: Parameters<typeof real>) => {
      const out = real(...args);
      bytes += out.length;
      return out;
    });
    const Real = globalThis.DecompressionStream;
    class Counting {
      readonly writable: WritableStream<BufferSource>;
      readonly readable: ReadableStream<Uint8Array>;
      constructor(format: CompressionFormat) {
        const inner = new Real(format);
        this.writable = inner.writable;
        this.readable = inner.readable.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              bytes += chunk.length;
              controller.enqueue(chunk);
            },
          }),
        );
      }
    }
    vi.stubGlobal("DecompressionStream", Counting);
    try {
      const [result] = await Promise.allSettled([fn()]);
      return { result, bytes };
    } finally {
      spy.mockRestore();
      vi.unstubAllGlobals();
    }
  }

  it("positive control: the probe sees the analysis decode a legitimate link, byte for byte", async () => {
    const { result, bytes } = await countInflated(() => analyzeClimbReplay(`https://doomstack.lol/play?r=${tokenFor(300)}`));
    expect(result.status).toBe("fulfilled");
    expect(bytes).toBe(300);
  });

  it("never materializes more than a stream chunk past MAX_SHARE_TICKS for a bomb link", async () => {
    const { result, bytes } = await countInflated(() => analyzeClimbReplay(`https://doomstack.lol/play?r=${bomb}`));
    expect(result.status).toBe("rejected");
    expect(bytes).toBeLessThan(1024 * 1024);
  }, 60_000);
});
