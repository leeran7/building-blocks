/**
 * Climb camera — lava-on-screen is a camera-space fact, not a sim one.
 *
 * The canvas draws lava as a band from the hazard line down. Audio treats lava
 * as "shown" only once that line clears the touch-control overlay, so a mobile
 * bottom band sitting behind the buttons does not count as doom arriving.
 */

import { describe, expect, it } from "vitest";
import {
  CAMERA_FOCUS_FRAC,
  CAMERA_AIR_BAND_FRAC,
  CAMERA_FOLLOW,
  type ClimbCameraBag,
  heldFocusY,
  CAMERA_CATCHUP_MPS,
  cameraFocusY,
  WORLD_HEIGHT_STRETCH,
  cameraTargetY,
  climbView,
  followCamY,
  isLavaThreatening,
  lavaThreatFill,
} from "../../src/components/Game/climbCamera";
import {
  paintClimbFrame,
  type PaintCtx,
} from "../../src/components/Game/paintClimbFrame";
import { createMatch, stepMatch } from "../../src/game/simulation";
import { NO_INPUT, TICK_DT } from "../../src/game/types";
import { buildTower } from "../../src/game/towers";
import { GAME_CATEGORIES } from "../../src/game/categories";
import { SUPER_JUMP_MULT } from "../../src/game/powerups";

const WIDTH = 360;
const HEIGHT = 640;
const TOWER_WIDTH_M = 100;
const TOUCH_INSET_PX = 112;

describe("climbView: locked 9:16 desktop size", () => {
  it("fits the tower width and sees (height/width)*towerWidth/stretch metres tall", () => {
    const { pxPerM, pxPerMY, viewH } = climbView(WIDTH, HEIGHT, TOWER_WIDTH_M);
    expect(pxPerM).toBeCloseTo(WIDTH / TOWER_WIDTH_M);
    expect(pxPerMY).toBeCloseTo((WIDTH / TOWER_WIDTH_M) * WORLD_HEIGHT_STRETCH);
    expect(viewH).toBeCloseTo(
      ((HEIGHT / WIDTH) * TOWER_WIDTH_M) / WORLD_HEIGHT_STRETCH
    );
  });
});

describe("cameraTargetY: keeps the climber at CAMERA_FOCUS_FRAC", () => {
  it("clamps to the base on desktop so opening lava stays off-screen", () => {
    const { pxPerMY: pxPerM, viewH } = climbView(WIDTH, HEIGHT, TOWER_WIDTH_M);
    const cam = cameraTargetY(0, viewH, 0, pxPerM);
    expect(cam).toBe(0);
    expect(isLavaThreatening(lavaThreatFill(-9, cam, viewH, 0))).toBe(false);
  });

  it("places a high climber at CAMERA_FOCUS_FRAC of the view", () => {
    const { pxPerMY: pxPerM, viewH } = climbView(WIDTH, HEIGHT, TOWER_WIDTH_M);
    const playerY = 220;
    const cam = cameraTargetY(playerY, viewH, 0, pxPerM);
    expect(cam).toBeCloseTo(playerY - viewH * (1 - CAMERA_FOCUS_FRAC));
    expect(playerScreenFrac(playerY, cam, viewH)).toBeCloseTo(CAMERA_FOCUS_FRAC);
  });

  it("sits below the base by the overlay metres on a touch stage", () => {
    const { pxPerMY: pxPerM, viewH } = climbView(WIDTH, HEIGHT, TOWER_WIDTH_M);
    const cam = cameraTargetY(0, viewH, TOUCH_INSET_PX, pxPerM);
    expect(cam).toBeCloseTo(-(TOUCH_INSET_PX / pxPerM));
    expect(cam).toBeLessThan(0);
  });
});

describe("lavaThreatFill: 0 until the line clears the overlay", () => {
  it("is 0 when lava is still below the camera on desktop", () => {
    const { viewH } = climbView(WIDTH, HEIGHT, TOWER_WIDTH_M);
    const fill = lavaThreatFill(-9, 0, viewH, 0);
    expect(fill).toBe(0);
    expect(isLavaThreatening(fill)).toBe(false);
  });

  it("becomes threatening the moment the line crosses the camera bottom", () => {
    const { viewH } = climbView(WIDTH, HEIGHT, TOWER_WIDTH_M);
    const just = lavaThreatFill(0.01, 0, viewH, 0);
    expect(isLavaThreatening(just)).toBe(true);
    expect(just).toBeGreaterThan(0);
    expect(just).toBeLessThan(0.01);
  });

  it("is 1 when lava has eaten the whole view", () => {
    const { viewH } = climbView(WIDTH, HEIGHT, TOWER_WIDTH_M);
    expect(lavaThreatFill(viewH, 0, viewH, 0)).toBe(1);
    expect(lavaThreatFill(viewH + 40, 0, viewH, 0)).toBe(1);
  });

  it("ignores lava that only sits in the touch-control overlay", () => {
    const { pxPerMY: pxPerM, viewH } = climbView(WIDTH, HEIGHT, TOWER_WIDTH_M);
    const insetM = TOUCH_INSET_PX / pxPerM;
    const cam = cameraTargetY(0, viewH, TOUCH_INSET_PX, pxPerM);
    // Opening hazard is ~9m below the base; camera sits ~insetM below 0, so
    // the lava line is in the overlay, not the playable view.
    const behindButtons = lavaThreatFill(-9, cam, viewH, insetM);
    expect(behindButtons).toBe(0);
    expect(isLavaThreatening(behindButtons)).toBe(false);
    const aboveOverlay = lavaThreatFill(0.5, cam, viewH, insetM);
    expect(isLavaThreatening(aboveOverlay)).toBe(true);
  });

  it("is 0.5 when lava covers half the uncovered view", () => {
    const viewH = 100;
    const inset = 20;
    // Uncovered view is 80m starting at cam+inset = 20.
    expect(lavaThreatFill(20 + 40, 0, viewH, inset)).toBe(0.5);
  });
});

describe("followCamY: snaps on a new run, eases otherwise", () => {
  it("snaps when there is no previous camera", () => {
    expect(followCamY(null, 40, 100, TICK_DT, false)).toBe(40);
  });

  it("snaps when the caller asks for it (new run / replay seek)", () => {
    expect(followCamY(0, 40, 100, TICK_DT, true)).toBe(40);
  });

  it("eases a small error by CAMERA_FOLLOW over one tick", () => {
    expect(followCamY(0, 10, 100, TICK_DT, false)).toBeCloseTo(
      10 * CAMERA_FOLLOW
    );
  });

  it("snaps a gap bigger than half a view (seek / respawn)", () => {
    expect(followCamY(0, 80, 100, TICK_DT, false)).toBe(80);
  });

  it("closes the same fraction per tick however often it is called", () => {
    // One tick's worth of ease, taken in four 120 Hz frames, must land where a
    // single tick-sized step lands — otherwise the follow tightens with refresh
    // rate and the camera feels different on a 120 Hz panel than a 30 Hz one.
    let cam = 0;
    for (let i = 0; i < 4; i++) cam = followCamY(cam, 10, 100, TICK_DT / 4, false);
    expect(cam).toBeCloseTo(followCamY(0, 10, 100, TICK_DT, false), 10);
  });

  it("holds still across a zero-length frame", () => {
    expect(followCamY(4, 10, 100, 0, false)).toBe(4);
  });
});

describe("lavaThreatFill against a real match", () => {
  it("opening lava is not a threat on the desktop 9:16 view", () => {
    const tower = buildTower("indie-games");
    const m = createMatch({
      seed: "lava-view",
      mode: "solo",
      tower,
      playerIds: ["p1"],
    });
    m.phase = "climb";
    m.tick = 0;
    stepMatch(m, { p1: NO_INPUT });
    expect(m.hazardY).toBeLessThan(0);
    const { pxPerMY: pxPerM, viewH } = climbView(WIDTH, HEIGHT, tower.widthM);
    const cam = cameraTargetY(m.players[0]!.y, viewH, 0, pxPerM);
    expect(isLavaThreatening(lavaThreatFill(m.hazardY, cam, viewH, 0))).toBe(
      false
    );
  });

  it("lava becomes a threat while a high climber is still alive", () => {
    const tower = buildTower("indie-games");
    const { pxPerMY: pxPerM, viewH } = climbView(WIDTH, HEIGHT, tower.widthM);
    const playerY = 120;
    const cam = cameraTargetY(playerY, viewH, 0, pxPerM);
    // Just below the uncovered camera bottom — still hidden.
    expect(
      isLavaThreatening(lavaThreatFill(cam, cam, viewH, 0))
    ).toBe(false);
    // A metre of lava in the view, well below the climber's feet.
    const fill = lavaThreatFill(cam + 8, cam, viewH, 0);
    expect(isLavaThreatening(fill)).toBe(true);
    expect(cam + 8).toBeLessThan(playerY);
  });
});

function playerScreenFrac(playerY: number, camY: number, viewH: number): number {
  return 1 - (playerY - camY) / viewH;
}

describe("cameraFocusY: holds through jumps, glides on catch-up", () => {
  const BAND = 20;
  const STEP = 1;

  it("frames the climber when there is no history yet", () => {
    expect(cameraFocusY(null, null, 140, false, BAND, STEP)).toBe(140);
    expect(cameraFocusY(100, null, 140, true, BAND, STEP)).toBe(140);
  });

  it("moves one-for-one with a supported climber, whatever the speed", () => {
    expect(cameraFocusY(100, 100, 100.5, true, BAND, STEP)).toBe(100.5);
    expect(cameraFocusY(100, 100, 170, true, BAND, STEP)).toBe(170);
  });

  it("closes a leftover gap by at most maxStep per frame", () => {
    // Focus held 20 m below after a landing: one frame closes 1 m of it.
    expect(cameraFocusY(80, 100, 100, true, BAND, STEP)).toBe(81);
    expect(cameraFocusY(120, 100, 100, true, BAND, STEP)).toBe(119);
    // The gap rides along with the climber's own motion.
    expect(cameraFocusY(80, 100, 110, true, BAND, STEP)).toBe(91);
    // A gap smaller than the step closes fully.
    expect(cameraFocusY(99.5, 100, 100, true, BAND, STEP)).toBe(100);
  });

  it("holds the take-off height while the arc stays inside the band", () => {
    expect(cameraFocusY(100, 100, 103, false, BAND, STEP)).toBe(100);
    expect(cameraFocusY(100, 103, 97, false, BAND, STEP)).toBe(100);
  });

  it("drags the band edge once the climber leaves it", () => {
    expect(cameraFocusY(100, 115, 130, false, BAND, STEP)).toBe(130 - BAND);
    expect(cameraFocusY(100, 85, 60, false, BAND, STEP)).toBe(60 + BAND);
  });
});

describe("paintClimbFrame camera through a real jump arc", () => {
  it("does not move while the climber is airborne within the band", () => {
    const tower = buildTower("indie-games");
    const m = createMatch({
      seed: "jump-cam",
      mode: "solo",
      tower,
      playerIds: ["p1"],
    });
    const p = m.players[0]!;
    const ctx = new Proxy(
      {},
      {
        get: (_t, prop) =>
          prop === "measureText"
            ? () => ({ width: 10 })
            : typeof prop === "string" && prop.startsWith("create")
              ? () => ({ addColorStop() {} })
              : () => {},
        set: () => true,
      }
    ) as unknown as PaintCtx;
    const camera = { y: null as number | null, tick: null as number | null };
    const paint = () =>
      paintClimbFrame(ctx, m, { width: WIDTH, height: HEIGHT, camera });

    // Stand high enough that the camera is not clamped at the base, and let
    // the ease settle.
    const BASE_Y = 200;
    p.y = BASE_Y;
    p.onGround = true;
    for (let t = 1; t <= 60; t++) {
      m.tick = t + 0.5;
      paint();
    }
    const settled = camera.y!;

    // A 3m jump arc: the camera must not ride it.
    let checked = 0;
    for (let i = 1; i <= 20; i++) {
      p.onGround = false;
      p.y = BASE_Y + 3 * Math.sin((Math.PI * i) / 21);
      m.tick = 60.5 + i;
      paint();
      expect(camera.y).toBeCloseTo(settled, 9);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);

    // Landing a floor higher: the camera follows again.
    p.onGround = true;
    p.y = BASE_Y + 24;
    for (let i = 1; i <= 60; i++) {
      m.tick = 80.5 + i;
      paint();
    }
    expect(camera.y!).toBeGreaterThan(settled + 20);
  });

  it("follows jetpack thrust and glides after a long fall", () => {
    const tower = buildTower("indie-games");
    const m = createMatch({
      seed: "jet-cam",
      mode: "solo",
      tower,
      playerIds: ["p1"],
    });
    const p = m.players[0]!;
    const ctx = new Proxy(
      {},
      {
        get: (_t, prop) =>
          prop === "measureText"
            ? () => ({ width: 10 })
            : typeof prop === "string" && prop.startsWith("create")
              ? () => ({ addColorStop() {} })
              : () => {},
        set: () => true,
      }
    ) as unknown as PaintCtx;
    const camera = { y: null as number | null, tick: null as number | null };
    let tick = 0.5;
    const paint = () => {
      tick += 1;
      m.tick = tick;
      paintClimbFrame(ctx, m, {
        width: WIDTH,
        height: HEIGHT,
        camera,
        dtSec: TICK_DT,
      });
      return camera.y!;
    };

    p.y = 200;
    p.onGround = true;
    for (let i = 0; i < 60; i++) paint();
    const start = camera.y!;

    // Jetpack: 12 m/s for 3 s, well past the jump band. The camera rises with
    // the climber the whole way rather than parking and catching up later.
    p.onGround = false;
    p.jetpackThrusting = true;
    for (let i = 0; i < 90; i++) {
      p.y += 12 * TICK_DT;
      paint();
    }
    const { viewH } = climbView(WIDTH, HEIGHT, tower.widthM);
    const cameraLagM = p.y - viewH * (1 - CAMERA_FOCUS_FRAC) - camera.y!;
    expect(camera.y!).toBeGreaterThan(start + 30);
    expect(cameraLagM).toBeLessThan(2);

    // Thrust ends and the climber drops 40 m: the camera is dragged down by
    // the band. Landing then glides in: no frame moves faster than the fall
    // already was or the catch-up cap. Snapping the focus moved ~6 m at once.
    p.jetpackThrusting = false;
    let fallPrev = camera.y!;
    let fallMaxStep = 0;
    for (let i = 0; i < 40; i++) {
      p.y -= 1;
      const y = paint();
      fallMaxStep = Math.max(fallMaxStep, Math.abs(y - fallPrev));
      fallPrev = y;
    }
    p.onGround = true;
    let prev = camera.y!;
    let maxStep = 0;
    let steps = 0;
    for (let i = 0; i < 90; i++) {
      const y = paint();
      maxStep = Math.max(maxStep, Math.abs(y - prev));
      prev = y;
      steps++;
    }
    expect(steps).toBeGreaterThan(0);
    expect(maxStep).toBeGreaterThan(0);
    expect(maxStep).toBeLessThanOrEqual(
      Math.max(fallMaxStep, CAMERA_CATCHUP_MPS * TICK_DT) + 1e-9
    );
  });
});

describe("heldFocusY: lava audio frames what the painter framed", () => {
  const BAND = 20;

  it("uses the painted focus while it is within the band of the climber", () => {
    expect(heldFocusY(100, 110, BAND)).toBe(100);
    expect(heldFocusY(130, 110, BAND)).toBe(130);
  });

  it("falls back to the climber for a stale or missing focus", () => {
    expect(heldFocusY(undefined, 110, BAND)).toBe(110);
    expect(heldFocusY(null, 110, BAND)).toBe(110);
    expect(heldFocusY(NaN, 110, BAND)).toBe(110);
    // A focus from a previous run, far from this climber.
    expect(heldFocusY(900, 110, BAND)).toBe(110);
  });

  it("agrees with the painted camera mid super jump", () => {
    const tower = buildTower("indie-games");
    const m = createMatch({
      seed: "audio-cam",
      mode: "solo",
      tower,
      playerIds: ["p1"],
    });
    const p = m.players[0]!;
    const ctx = new Proxy(
      {},
      {
        get: (_t, prop) =>
          prop === "measureText"
            ? () => ({ width: 10 })
            : typeof prop === "string" && prop.startsWith("create")
              ? () => ({ addColorStop() {} })
              : () => {},
        set: () => true,
      }
    ) as unknown as PaintCtx;
    const camera: ClimbCameraBag = { y: null, tick: null };
    const { viewH, pxPerMY } = climbView(WIDTH, HEIGHT, tower.widthM);
    const band = viewH * CAMERA_AIR_BAND_FRAC;
    let tick = 0.5;
    const paint = () => {
      tick += 1;
      m.tick = tick;
      paintClimbFrame(ctx, m, { width: WIDTH, height: HEIGHT, camera, dtSec: TICK_DT });
    };
    p.y = 200;
    p.onGround = true;
    for (let i = 0; i < 30; i++) paint();
    p.onGround = false;
    p.y = 211; // apex of a super jump, inside the band
    paint();

    const audioFocus = heldFocusY(camera.focusY, p.y, band);
    expect(audioFocus).toBe(camera.focusY);
    expect(audioFocus).toBeCloseTo(200);
    // Old audio framing (the raw climber) disagreed by the whole jump height.
    const audioCam = cameraTargetY(audioFocus, viewH, 0, pxPerMY);
    const rawCam = cameraTargetY(p.y, viewH, 0, pxPerMY);
    expect(rawCam - audioCam).toBeCloseTo(11);
  });
});

describe("CAMERA_AIR_BAND_FRAC: single super jumps never move the camera", () => {
  it("holds the tallest super jump apex of every tower on the 9:16 view", () => {
    const { viewH } = climbView(WIDTH, HEIGHT, TOWER_WIDTH_M);
    const band = viewH * CAMERA_AIR_BAND_FRAC;
    let checked = 0;
    for (const category of GAME_CATEGORIES) {
      const t = buildTower(category);
      const v = t.jumpSpeed * SUPER_JUMP_MULT;
      const apex = (v * v) / (2 * t.gravity);
      expect(apex).toBeLessThan(band);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
