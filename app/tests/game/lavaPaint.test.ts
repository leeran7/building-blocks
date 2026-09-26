/**
 * paintClimbFrame draws the lava's phase look and the off-screen proximity
 * glow — through the real painter, not the helpers alone, so a missing call
 * site, a dropped phase, or a gap computed from the wrong edge (ignoring
 * bottomInset) goes red.
 *
 * The recording context tags every gradient with its colour stops; the glow
 * is the linear gradient whose first stop is the proximity ember.
 */

import { describe, expect, it } from "vitest";
import { cameraTargetY, climbView } from "../../src/components/Game/climbCamera";
import { paintClimbFrame, type PaintCtx } from "../../src/components/Game/paintClimbFrame";
import { LAVA_PROXIMITY_M } from "../../src/components/Game/lava";
import { createMatch } from "../../src/game/simulation";
import { DEFAULT_HAZARD_CONFIG, hazardPhase } from "../../src/game/hazard";
import { buildFreeTower } from "../../src/game/freeStack";
import type { MatchState } from "../../src/game/types";

const WIDTH = 360;
const HEIGHT = 640;
const PLAYER_Y = 400;
const GLOW_FIRST_STOP = "rgba(255,90,44,1)";

type Grad = { stops: string[] };
type Rect = { y: number; h: number; alpha: number };

function recordingContext(): { ctx: PaintCtx; glowRects: Rect[]; arcs: { n: number } } {
  const glowRects: Rect[] = [];
  const arcs = { n: 0 };
  const state: Record<string | symbol, unknown> = { globalAlpha: 1 };
  const ctx = new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === "fillRect") {
        return (_x: number, y: number, _w: number, h: number) => {
          const fs = target.fillStyle as Grad | undefined;
          if (fs && Array.isArray(fs.stops) && fs.stops[0] === GLOW_FIRST_STOP) {
            glowRects.push({ y, h, alpha: target.globalAlpha as number });
          }
        };
      }
      if (prop === "arc") return () => { arcs.n += 1; };
      if (prop === "measureText") return () => ({ width: 10 });
      if (typeof prop === "string" && prop.startsWith("create")) {
        return () => {
          const g: Grad & { addColorStop: (o: number, c: string) => void } = {
            stops: [],
            addColorStop: (_o: number, c: string) => g.stops.push(c),
          };
          return g;
        };
      }
      return () => {};
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as PaintCtx;
  return { ctx, glowRects, arcs };
}

/** A climbing match with the player at PLAYER_Y and the lava `gap` m below the visible bottom. */
function matchWithGap(gapBelowViewM: number, bottomInset: number): MatchState {
  const tower = buildFreeTower();
  const m = createMatch({ seed: "proximity", mode: "solo", tower, playerIds: ["p1"] });
  m.phase = "climb";
  m.tick = 40;
  m.raceSeconds = 40 / 30;
  const p = m.players[0]!;
  p.y = PLAYER_Y;
  p.peakY = PLAYER_Y;
  const { pxPerM, viewH } = climbView(WIDTH, HEIGHT, tower.widthM);
  const visibleBottom = cameraTargetY(PLAYER_Y, viewH, bottomInset, pxPerM) + bottomInset / pxPerM;
  m.hazardY = visibleBottom - gapBelowViewM;
  return m;
}

function paint(gap: number, bottomInset: number): Rect[] {
  const { ctx, glowRects } = recordingContext();
  paintClimbFrame(ctx, matchWithGap(gap, bottomInset), {
    width: WIDTH,
    height: HEIGHT,
    bottomInset,
    includeHud: false,
  });
  return glowRects;
}

describe("paintClimbFrame: proximity glow", () => {
  it("glows along the visible bottom when the lava is just below the view", () => {
    const rects = paint(20, 0);
    expect(rects).toHaveLength(1);
    expect(rects[0]!.y + rects[0]!.h).toBeCloseTo(HEIGHT, 6);
    expect(rects[0]!.alpha).toBeGreaterThan(0);
  });

  it("measures from above the touch overlay and draws the glow there", () => {
    const inset = 90;
    const rects = paint(20, inset);
    expect(rects).toHaveLength(1);
    expect(rects[0]!.y + rects[0]!.h).toBeCloseTo(HEIGHT - inset, 6);
  });

  it("glows while the lava is only under the overlay (painted but hidden)", () => {
    // Lava 5 m under the visible bottom but inside the 90 px overlay band.
    expect(paint(5, 90)).toHaveLength(1);
  });

  it("does not glow when the lava is on screen or beyond the band", () => {
    expect(paint(-10, 0)).toHaveLength(0);
    expect(paint(LAVA_PROXIMITY_M + 5, 0)).toHaveLength(0);
  });

  it("glows brighter as the lava closes", () => {
    const near = paint(10, 0)[0]!.alpha;
    const far = paint(50, 0)[0]!.alpha;
    expect(near).toBeGreaterThan(far);
  });
});

describe("paintClimbFrame: the lava shows the sim's surge / stumble phase", () => {
  /** Same frame, lava on screen; only the effective hazard time differs. */
  function arcsAt(effectiveSeconds: number): { arcs: number; phase: string } {
    const m = matchWithGap(-40, 0);
    m.raceSeconds = 60;
    m.hazardSlowSeconds = m.raceSeconds - effectiveSeconds;
    const { ctx, arcs } = recordingContext();
    paintClimbFrame(ctx, m, { width: WIDTH, height: HEIGHT, includeHud: false });
    return { arcs: arcs.n, phase: hazardPhase(effectiveSeconds).phase };
  }

  it("a surge frame draws more embers and bubbles than a stumble frame", () => {
    const cfg = DEFAULT_HAZARD_CONFIG;
    const surgeDur = cfg.stumblePeriodSeconds - cfg.stumbleDurationSeconds;
    const surge = arcsAt(cfg.graceSeconds + cfg.stumblePeriodSeconds + surgeDur / 2);
    const stumble = arcsAt(cfg.graceSeconds + cfg.stumblePeriodSeconds + surgeDur + cfg.stumbleDurationSeconds / 2);
    expect(surge.phase).toBe("surge");
    expect(stumble.phase).toBe("stumble");
    expect(surge.arcs).toBeGreaterThan(stumble.arcs);
  });
});
