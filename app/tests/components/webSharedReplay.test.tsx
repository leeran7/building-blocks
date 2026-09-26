/**
 * Web /play?r=<token> (ClimbPlayClient), the real consumer of share links.
 * SEC-DC-1 moved the browser decoder to a chunked, output-capped inflate. A
 * legitimate link, including one whose inflated log spans several
 * DecompressionStream chunks, must still load its replay into the scene, and
 * a decompression bomb at the token cap must show the invalid-link copy
 * rather than hang the tab.
 *
 * ClimbScene is stubbed to record the replay it gets. The decoder is real.
 *
 * @vitest-environment happy-dom
 */

import { deflateSync } from "node:zlib";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const scene = vi.hoisted(() => ({ replays: [] as unknown[] }));

vi.mock("../../src/components/Game/ClimbScene", () => ({
  ClimbScene: (props: { replay?: unknown }) => {
    scene.replays.push(props.replay ?? null);
    return createElement("div", { "data-testid": "scene" });
  },
}));
vi.mock("../../src/components/Game/ClimbControlsGuide", () => ({ ClimbControlsGuide: () => null }));

import { ClimbPlayClient } from "../../src/components/Game/ClimbPlayClient";
import {
  encodeRunReplay,
  MAX_REPLAY_TOKEN_LENGTH,
  MAX_SHARE_TICKS,
  packInputLog,
  unpackInputLog,
} from "../../src/game/runReplay";
import type { PlayerInput } from "../../src/game/types";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mount(replayToken: string | null) {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container!);
    root.render(createElement(ClimbPlayClient, { replayToken }));
  });
  // The decode is async (streams); let it resolve.
  for (let i = 0; i < 50 && container.textContent?.includes("Loading replay"); i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
}

beforeEach(() => {
  scene.replays = [];
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

/** Varied inputs so deflate cannot collapse the log into a trivial stream. */
function variedInputs(n: number): PlayerInput[] {
  let r = 7;
  return Array.from({ length: n }, () => {
    r = (r * 16807) % 2147483647;
    return {
      moveX: ((r % 3) - 1) as -1 | 0 | 1,
      jump: r % 5 === 0,
      climbY: ((r >> 3) % 3 - 1) as -1 | 0 | 1,
      usePowerUp: r % 11 === 0,
    };
  });
}

describe("/play share links after the capped browser decoder (SEC-DC-1)", () => {
  it("plays a legitimate long share link: the scene gets the exact replay", async () => {
    // 17,500 ticks inflate across several stream chunks and sit just under the cap.
    const inputs = variedInputs(17_500);
    const token = await encodeRunReplay({ seed: "share-seed", peakY: 42.5, inputs });
    expect(token).not.toBeNull();
    expect(token!.length).toBeLessThanOrEqual(MAX_REPLAY_TOKEN_LENGTH);

    await mount(token);
    expect(container!.textContent).not.toContain("invalid or expired");
    const replay = scene.replays.at(-1) as { seed: string; peakY: number; inputs: PlayerInput[] } | null;
    expect(replay).not.toBeNull();
    expect(replay!.seed).toBe("share-seed");
    expect(replay!.peakY).toBe(42.5);
    expect(replay!.inputs).toHaveLength(17_500);
    // The share format packs each tick into a byte; compare with production's own round trip.
    expect(replay!.inputs).toEqual(unpackInputLog(packInputLog(inputs)));
  });

  it("a decompression bomb at the token cap shows the invalid-link copy quickly", async () => {
    const comp = deflateSync(Buffer.alloc(18_900_000, 0b01001), { level: 9 });
    const token = Buffer.from(
      JSON.stringify({ v: 1, s: "share-seed", p: 1, i: Buffer.from(comp).toString("base64url") }),
    ).toString("base64url");
    expect(token.length).toBeLessThanOrEqual(MAX_REPLAY_TOKEN_LENGTH);

    const start = performance.now();
    await mount(token);
    expect(performance.now() - start).toBeLessThan(2_000);
    expect(container!.textContent).toContain("That replay link is invalid or expired.");
    expect(scene.replays).toEqual([]);
  }, 30_000);

  it("one tick over MAX_SHARE_TICKS is refused, the cap itself plays", async () => {
    const over = await encodeRunReplay({ seed: "s", peakY: 1, inputs: variedInputs(MAX_SHARE_TICKS + 1) });
    // encodeRunReplay itself may refuse over-cap logs; build the token by hand if so.
    const overToken =
      over ??
      Buffer.from(
        JSON.stringify({
          v: 1,
          s: "s",
          p: 1,
          i: deflateSync(Buffer.alloc(MAX_SHARE_TICKS + 1, 0b01001)).toString("base64url"),
        }),
      ).toString("base64url");
    await mount(overToken);
    expect(container!.textContent).toContain("invalid or expired");
    act(() => root?.unmount());
    container?.remove();

    const atCap = Buffer.from(
      JSON.stringify({ v: 1, s: "s", p: 1, i: deflateSync(Buffer.alloc(MAX_SHARE_TICKS, 0b01001)).toString("base64url") }),
    ).toString("base64url");
    scene.replays = [];
    await mount(atCap);
    expect((scene.replays.at(-1) as { inputs: unknown[] } | null)?.inputs).toHaveLength(MAX_SHARE_TICKS);
  });
});
