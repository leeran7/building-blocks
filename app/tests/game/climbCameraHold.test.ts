/**
 * Climb camera hold — the view does not ride every jump.
 *
 * The camera frames a focus height rather than the raw climber. Supported
 * (ground, ladder, jetpack thrust) it moves with them; airborne it holds, so
 * ordinary jumps leave the view still. Super-jump rises past a short lead are
 * followed; long falls drag the view along. Any gap left by a hold closes at a
 * capped speed so landings glide instead of lurching. Lava audio frames the
 * same focus the canvas painted.
 */

import { describe, expect, it } from "vitest";
import {
  CAMERA_AIR_BAND_FRAC,
  CAMERA_CATCHUP_MPS,
  CAMERA_FOCUS_FRAC,
  CAMERA_SUPER_LEAD_FRAC,
  type ClimbCameraBag,
  cameraFocusY,
  cameraTargetY,
  climbView,
  heldFocusY,
} from "../../src/components/Game/climbCamera";
import {
  paintClimbFrame,
  type PaintCtx,
} from "../../src/components/Game/paintClimbFrame";
import { GAME_CATEGORIES } from "../../src/game/categories";
import { grantPowerUp, SUPER_JUMP_MULT } from "../../src/game/powerups";
import { createMatch } from "../../src/game/simulation";
import { buildTower } from "../../src/game/towers";
import { TICK_DT } from "../../src/game/types";

const WIDTH = 360;
const HEIGHT = 640;
const TOWER_WIDTH_M = 100;
/** High enough that the camera is never clamped at the tower base. */
const BASE_Y = 200;

const nullCtx = new Proxy(
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

/**
 * A real match painted one tick per frame into a shared camera bag, with the
 * climber standing at BASE_Y and the camera settled on them.
 */
function cameraRig(seed: string) {
  const tower = buildTower("indie-games");
  const m = createMatch({ seed, mode: "solo", tower, playerIds: ["p1"] });
  const p = m.players[0]!;
  const camera: ClimbCameraBag = { y: null, tick: null };
  const { viewH, pxPerM } = climbView(WIDTH, HEIGHT, tower.widthM);
  // Off the integer lattice so interpolated-tick snapping never triggers.
  let tick = 0.5;
  const paint = () => {
    tick += 1;
    m.tick = tick;
    paintClimbFrame(nullCtx, m, {
      width: WIDTH,
      height: HEIGHT,
      camera,
      dtSec: TICK_DT,
    });
    return camera.y!;
  };
  p.y = BASE_Y;
  p.onGround = true;
  for (let i = 0; i < 60; i++) paint();
  return { m, p, camera, paint, viewH, pxPerM, tick: () => tick, settled: camera.y! };
}

describe("cameraFocusY", () => {
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
    expect(cameraFocusY(80, 100, 100, true, BAND, STEP)).toBe(81);
    expect(cameraFocusY(120, 100, 100, true, BAND, STEP)).toBe(119);
    // The gap rides along with the climber's own motion.
    expect(cameraFocusY(80, 100, 110, true, BAND, STEP)).toBe(91);
    // A gap smaller than the step closes fully.
    expect(cameraFocusY(99.5, 100, 100, true, BAND, STEP)).toBe(100);
  });

  it("holds while an airborne climber stays inside the band", () => {
    expect(cameraFocusY(100, 100, 103, false, BAND, STEP)).toBe(100);
    expect(cameraFocusY(100, 103, 97, false, BAND, STEP)).toBe(100);
  });

  it("drags the band edge once the climber leaves it", () => {
    expect(cameraFocusY(100, 115, 130, false, BAND, STEP)).toBe(130 - BAND);
    expect(cameraFocusY(100, 85, 60, false, BAND, STEP)).toBe(60 + BAND);
  });

  it("uses a separate, shorter lead for rising when given one", () => {
    expect(cameraFocusY(100, 100, 104, false, BAND, STEP, 5)).toBe(100);
    expect(cameraFocusY(100, 104, 109, false, BAND, STEP, 5)).toBe(104);
    // Falling still uses the full band.
    expect(cameraFocusY(100, 100, 85, false, BAND, STEP, 5)).toBe(100);
  });
});

describe("band and lead sizing against every tower's physics", () => {
  const { viewH } = climbView(WIDTH, HEIGHT, TOWER_WIDTH_M);

  it("holds the fall back from the tallest super-jump apex", () => {
    let checked = 0;
    for (const category of GAME_CATEGORIES) {
      const t = buildTower(category);
      const v = t.jumpSpeed * SUPER_JUMP_MULT;
      expect((v * v) / (2 * t.gravity)).toBeLessThan(viewH * CAMERA_AIR_BAND_FRAC);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("lets every ordinary jump rise without reaching the super-jump lead", () => {
    let checked = 0;
    for (const category of GAME_CATEGORIES) {
      const t = buildTower(category);
      const apex = (t.jumpSpeed * t.jumpSpeed) / (2 * t.gravity);
      expect(apex).toBeLessThan(viewH * CAMERA_SUPER_LEAD_FRAC);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("paintClimbFrame camera", () => {
  it("does not move through an ordinary jump", () => {
    const { p, camera, paint, settled } = cameraRig("jump-cam");
    let checked = 0;
    for (let i = 1; i <= 20; i++) {
      p.onGround = false;
      p.y = BASE_Y + 3 * Math.sin((Math.PI * i) / 21);
      paint();
      expect(camera.y).toBeCloseTo(settled, 9);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("follows a landing a floor higher", () => {
    const { p, camera, paint, settled } = cameraRig("land-cam");
    p.y = BASE_Y + 24;
    for (let i = 0; i < 60; i++) paint();
    expect(camera.y!).toBeGreaterThan(settled + 20);
  });

  it("climbs with jetpack thrust and glides in after a long fall", () => {
    const { p, camera, paint, viewH, settled } = cameraRig("jet-cam");
    p.onGround = false;
    p.jetpackThrusting = true;
    for (let i = 0; i < 90; i++) {
      p.y += 12 * TICK_DT;
      paint();
    }
    const lagM = p.y - viewH * (1 - CAMERA_FOCUS_FRAC) - camera.y!;
    expect(camera.y!).toBeGreaterThan(settled + 30);
    expect(lagM).toBeLessThan(2);

    // Thrust ends and the climber drops 40 m; landing then glides in no faster
    // than the fall already moved or the catch-up cap allows.
    p.jetpackThrusting = false;
    let prev = camera.y!;
    let fallMaxStep = 0;
    for (let i = 0; i < 40; i++) {
      p.y -= 1;
      const y = paint();
      fallMaxStep = Math.max(fallMaxStep, Math.abs(y - prev));
      prev = y;
    }
    p.onGround = true;
    let maxStep = 0;
    for (let i = 0; i < 90; i++) {
      const y = paint();
      maxStep = Math.max(maxStep, Math.abs(y - prev));
      prev = y;
    }
    expect(maxStep).toBeGreaterThan(0);
    expect(maxStep).toBeLessThanOrEqual(
      Math.max(fallMaxStep, CAMERA_CATCHUP_MPS * TICK_DT) + 1e-9
    );
  });

  it("follows a super-jump rise past the lead, holds the fall, glides back", () => {
    const { p, camera, paint, viewH, tick } = cameraRig("super-cam");
    grantPowerUp(p, "super-jump", Math.floor(tick()));
    const leadM = viewH * CAMERA_SUPER_LEAD_FRAC;
    const APEX = 12;

    p.onGround = false;
    p.vy = 30;
    let followed = 0;
    for (let i = 1; i <= APEX; i++) {
      p.y = BASE_Y + i;
      paint();
      if (i <= leadM) {
        expect(camera.focusY).toBeCloseTo(BASE_Y, 9);
      } else {
        expect(camera.focusY).toBeCloseTo(p.y - leadM, 9);
        followed++;
      }
    }
    expect(followed).toBeGreaterThan(0);

    p.vy = -30;
    for (let i = APEX - 1; i >= 0; i--) {
      p.y = BASE_Y + i;
      paint();
      expect(camera.focusY).toBeCloseTo(BASE_Y + APEX - leadM, 9);
    }

    p.onGround = true;
    p.vy = 0;
    let prevFocus = camera.focusY!;
    for (let i = 0; i < 60; i++) {
      paint();
      expect(prevFocus - camera.focusY!).toBeLessThanOrEqual(
        CAMERA_CATCHUP_MPS * TICK_DT + 1e-9
      );
      prevFocus = camera.focusY!;
    }
    expect(camera.focusY).toBeCloseTo(BASE_Y, 9);
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
    expect(heldFocusY(900, 110, BAND)).toBe(110);
  });

  it("agrees with the painted camera mid-jump", () => {
    const { p, camera, paint, viewH, pxPerM } = cameraRig("audio-cam");
    p.onGround = false;
    p.y = BASE_Y + 11;
    paint();
    const band = viewH * CAMERA_AIR_BAND_FRAC;
    const audioFocus = heldFocusY(camera.focusY, p.y, band);
    expect(audioFocus).toBe(camera.focusY);
    expect(audioFocus).toBeCloseTo(BASE_Y);
    // Framing the raw climber instead disagrees by the whole jump height.
    const audioCam = cameraTargetY(audioFocus, viewH, 0, pxPerM);
    const rawCam = cameraTargetY(p.y, viewH, 0, pxPerM);
    expect(rawCam - audioCam).toBeCloseTo(11);
  });
});
