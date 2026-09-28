/**
 * RV-DC-2 / SEC-DC-1: replayLogEncoding must check a raw log's length (at
 * most MAX_SHARE_TICKS) BEFORE it validates any byte, so an oversize log is
 * refused without a scan. The existing test times the call, which a scan of
 * ~18 k bytes also passes. This one records which bytes the classifier reads:
 * an oversize input may only have its two header bytes looked at.
 *
 * It also pins the classification at the edges the raw form allows: one
 * byte, the cap exactly, and a log whose first two bytes are the only packed
 * pair with a zlib-shaped first byte (0x08).
 */

import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import {
  decodeRunReplay,
  MAX_SHARE_TICKS,
  packInput,
  replayLogEncoding,
} from "../../src/game/runReplay";
import { decodeRunReplayServer } from "../../src/game/runReplayServer";
import type { PlayerInput } from "../../src/game/types";

const IDLE: PlayerInput = { moveX: 0, jump: false, climbY: 0, usePowerUp: false };
const CLIMB: PlayerInput = { moveX: 0, jump: false, climbY: 1, usePowerUp: false };
const ALL: PlayerInput[] = [];
for (const moveX of [-1, 0, 1] as const)
  for (const jump of [false, true])
    for (const climbY of [-1, 0, 1] as const) ALL.push({ moveX, jump, climbY, usePowerUp: false });

/** `bytes` behind a proxy that records every index read. */
function watched(bytes: Uint8Array): { view: Uint8Array; reads: Set<number> } {
  const reads = new Set<number>();
  const view = new Proxy(bytes, {
    get(target, prop) {
      if (typeof prop === "string" && /^\d+$/.test(prop)) reads.add(Number(prop));
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return { view, reads };
}

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const tokenWithLog = (bytes: Uint8Array) =>
  b64url(Buffer.from(JSON.stringify({ v: 1, s: "daily1-AbCdEfGhIjKlMnOpQrSt_-", p: 3, i: b64url(bytes) })));

describe("replayLogEncoding reads the length before any byte", () => {
  it("an oversize packed log is refused after reading at most the two header bytes", () => {
    const bytes = new Uint8Array(MAX_SHARE_TICKS + 1).fill(packInput(IDLE));
    const { view, reads } = watched(bytes);
    expect(replayLogEncoding(view)).toBeNull();
    expect([...reads].every((i) => i < 2)).toBe(true);
  });

  it("positive control: the same log at the cap is scanned byte by byte and is raw", () => {
    const bytes = new Uint8Array(MAX_SHARE_TICKS).fill(packInput(IDLE));
    const { view, reads } = watched(bytes);
    expect(replayLogEncoding(view)).toBe("raw");
    expect(reads.size).toBe(MAX_SHARE_TICKS);
  });

  it("a deflate log is classified from its header alone, whatever its length", () => {
    const z = deflateSync(new Uint8Array(4000).fill(packInput(CLIMB)));
    const { view, reads } = watched(z);
    expect(replayLogEncoding(view)).toBe("deflate");
    expect([...reads].sort((a, b) => a - b)).toEqual([0, 1]);
  });
});

describe("the raw form at its edges", () => {
  it("a single packed byte is raw and decodes to one tick on both decoders", async () => {
    const one = Uint8Array.of(packInput(CLIMB));
    expect(replayLogEncoding(one)).toBe("raw");
    expect(decodeRunReplayServer(tokenWithLog(one))?.inputs).toEqual([CLIMB]);
    expect((await decodeRunReplay(tokenWithLog(one)))?.inputs).toEqual([CLIMB]);
  });

  it("a log starting 0x08 (CM=8 in the low nibble, and a packed byte) stays raw for every packed second byte", () => {
    expect(0x08 & 0x0f).toBe(8); // the one zlib-shaped packed first byte
    // Precondition: some real input packs to 0x08, so a client can send this log.
    expect(ALL.some((i) => packInput(i) === 0x08)).toBe(true);
    let checked = 0;
    for (const input of ALL) {
      const log = Uint8Array.of(0x08, packInput(input), 0x08);
      expect(replayLogEncoding(log)).toBe("raw");
      expect(decodeRunReplayServer(tokenWithLog(log))?.inputs).toHaveLength(3);
      checked++;
    }
    expect(checked).toBe(18);
  });

  it("negative control: 0x08 followed by 0x1D (the byte that would complete a zlib header) is refused, not inflated as raw", () => {
    // 0x1D has climb field 3, so no client packs it; it IS a valid FLG for CMF 0x08.
    expect(((0x08 << 8) | 0x1d) % 31).toBe(0);
    const log = Uint8Array.of(0x08, 0x1d, 0x08);
    expect(replayLogEncoding(log)).toBe("deflate");
    expect(decodeRunReplayServer(tokenWithLog(log))).toBeNull();
  });
});
