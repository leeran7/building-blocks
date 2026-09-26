/**
 * ClimbScene → usePowerUpFeedback wiring (spec-lava-apparency §5, §6).
 *
 * The pure units (hazardPhase, lavaMusicIntensity, isLavaInProximity,
 * stepCues) are covered on their own. This file pins the CALL SITE: the real
 * ClimbScene renders against a stubbed useClimb whose match state the test
 * controls, and a capturing mock of usePowerUpFeedback records exactly what
 * the scene hands it each render — the music intensity (leash ramp, not the
 * old 40 m ramp), the lava phase at EFFECTIVE hazard time (raceSeconds −
 * hazardSlowSeconds, the same clock the HUD and the painter read), and the
 * proximity flag that lets the surge cue fire while the lava is just off
 * screen.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicControl, WorldAudio } from "../../src/components/Game/usePowerUpFeedback";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

type FeedbackCall = { music: MusicControl | undefined; world: WorldAudio | undefined };

const fx = vi.hoisted(() => ({
  calls: [] as FeedbackCall[],
  /** Match fixture the stubbed useClimb returns. */
  raceSeconds: 0,
  hazardSlowSeconds: 0,
  playerY: 0,
  hazardY: 0,
  replaying: false,
}));

vi.mock("../../src/contexts/AuthContext", () => ({ useAuth: () => ({ user: null, token: null }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("../../src/components/Game/ClimbCanvas", () => ({ ClimbCanvas: () => null }));
// happy-dom has no layout (clientWidth 0), so the real hook measures a 0×0
// canvas and the camera sees a zero-height view. Pin the 9:16 base size a
// browser would measure so the lava-on-screen / proximity bands are real.
vi.mock("../../src/hooks/useCanvasSize", () => ({ useCanvasSize: () => ({ width: 360, height: 640 }) }));
vi.mock("../../src/components/Game/usePowerUpFeedback", () => ({
  usePowerUpFeedback: (_player: unknown, _tick: number, _runId: number, music?: MusicControl, world?: WorldAudio) => {
    fx.calls.push({ music, world });
    return { muted: false, setMuted: vi.fn(), announcement: "", unlockAudio: vi.fn() };
  },
}));

vi.mock("../../src/game/useClimb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/game/useClimb")>();
  const { createMatch } = await import("../../src/game/simulation");
  const { buildFreeTower } = await import("../../src/game/freeStack");
  return {
    ...actual,
    useClimb: () => {
      const state = createMatch({ seed: "s", mode: "solo", tower: buildFreeTower(), playerIds: ["you"] });
      state.phase = "climb";
      state.tick = Math.round(fx.raceSeconds * 30);
      state.raceSeconds = fx.raceSeconds;
      state.hazardSlowSeconds = fx.hazardSlowSeconds;
      state.hazardY = fx.hazardY;
      const p = state.players[0]!;
      p.y = fx.playerY;
      p.peakY = fx.playerY;
      return {
        state,
        simRef: { current: state },
        renderFeed: { current: { prev: state, next: state, at: 0 } },
        start: () => {},
        finished: false,
        setTouch: () => {},
        runId: 1,
        inputLog: [],
        replaying: fx.replaying,
        transport: null,
        togglePlayPause: () => {},
        cycleSpeed: () => {},
        rewind: () => {},
        seekToTick: () => {},
        restartReplay: () => {},
      };
    },
  };
});

import { ClimbScene } from "../../src/components/Game/ClimbScene";
import { buildFreeTower } from "../../src/game/freeStack";
import { hazardPhase } from "../../src/game/hazard";
import { LAVA_MUSIC_RAMP_M, lavaMusicIntensity } from "../../src/components/Game/powerUpCues";
import { LAVA_PROXIMITY_M } from "../../src/components/Game/lava";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ClimbScene, { tower: buildFreeTower(), categoryLabel: "Endless" }));
  });
}

async function rerender() {
  await act(async () => {
    root!.render(createElement(ClimbScene, { tower: buildFreeTower(), categoryLabel: "Endless" }));
  });
}

function lastCall(): FeedbackCall {
  const c = fx.calls[fx.calls.length - 1];
  if (!c) throw new Error("usePowerUpFeedback was never called");
  return c;
}

beforeEach(() => {
  fx.calls = [];
  fx.raceSeconds = 90;
  fx.hazardSlowSeconds = 0;
  fx.playerY = 500;
  fx.hazardY = 450;
  fx.replaying = false;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("ClimbScene → usePowerUpFeedback: lava phase", () => {
  // The leash banks NEGATIVE slow-seconds (the lava clock runs ahead of race
  // time), so effective time differs from raceSeconds. Fixtures are picked so
  // raw race time and effective hazard time fall in opposite phases.
  it.each([
    { raceSeconds: 90, hazardSlowSeconds: -8, want: "stumble", raw: "surge" },
    { raceSeconds: 98, hazardSlowSeconds: -8, want: "surge", raw: "stumble" },
  ] as const)(
    "hands over the phase at effective hazard time ($want at raw $raceSeconds s, slow $hazardSlowSeconds s)",
    async ({ raceSeconds, hazardSlowSeconds, want, raw }) => {
      // Fixture sanity: the two clocks really disagree here.
      expect(hazardPhase(raceSeconds).phase).toBe(raw);
      expect(hazardPhase(raceSeconds - hazardSlowSeconds).phase).toBe(want);
      fx.raceSeconds = raceSeconds;
      fx.hazardSlowSeconds = hazardSlowSeconds;
      await mount();
      expect(lastCall().world?.lavaPhase).toBe(want);
    }
  );

  it("follows the phase as it changes between renders (stumble → surge)", async () => {
    fx.raceSeconds = 90;
    fx.hazardSlowSeconds = -8;
    await mount();
    expect(lastCall().world?.lavaPhase).toBe("stumble");
    fx.raceSeconds = 98;
    await rerender();
    expect(lastCall().world?.lavaPhase).toBe("surge");
  });

  it("reports grace in the opening seconds", async () => {
    fx.raceSeconds = 2;
    fx.hazardSlowSeconds = 0;
    await mount();
    expect(lastCall().world?.lavaPhase).toBe("grace");
  });
});

describe("ClimbScene → usePowerUpFeedback: music intensity rides the leash ramp", () => {
  it("is active during the climb", async () => {
    await mount();
    expect(lastCall().music?.active).toBe(true);
  });

  it.each([
    // gap (m) → intensity over the leash-wide ramp (LAVA_MUSIC_RAMP_M = 90).
    // At 45 m the old (40 − gap)/40 formula gave 0; the leash ramp gives 0.5.
    { gap: 45, want: 0.5 },
    { gap: 0, want: 1 },
    { gap: 67.5, want: 0.25 },
    { gap: LAVA_MUSIC_RAMP_M, want: 0 },
    { gap: LAVA_MUSIC_RAMP_M + 30, want: 0 },
  ])("gap $gap m → intensity $want", async ({ gap, want }) => {
    expect(LAVA_MUSIC_RAMP_M).toBe(90);
    fx.playerY = 500;
    fx.hazardY = 500 - gap;
    await mount();
    const got = lastCall().music?.intensity;
    expect(got).toBeCloseTo(want, 9);
    expect(got).toBe(lavaMusicIntensity(gap));
  });

  it("the track tightens as the lava closes (monotone over the band)", async () => {
    await mount();
    let prev = -Infinity;
    let checked = 0;
    for (let gap = LAVA_MUSIC_RAMP_M - 1; gap >= 1; gap -= 8) {
      fx.hazardY = fx.playerY - gap;
      await rerender();
      const v = lastCall().music?.intensity ?? NaN;
      expect(v).toBeGreaterThan(prev);
      prev = v;
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("ClimbScene → usePowerUpFeedback: lava proximity flag", () => {
  type Row = { gap: number; onScreen: boolean; near: boolean | undefined };

  /**
   * Sweep the lava from just under the climber to far below on the mounted
   * scene; record the flags. `near` is recorded raw (no `?? false`), so a
   * call site that stops passing lavaNear shows up as `undefined` rather
   * than passing as "not near".
   */
  async function sweep(): Promise<Row[]> {
    const rows: Row[] = [];
    for (let gap = 1; gap <= 400; gap += 1) {
      fx.hazardY = fx.playerY - gap;
      await rerender();
      const w = lastCall().world!;
      rows.push({ gap, onScreen: w.lavaOnScreen, near: w.lavaNear });
    }
    return rows;
  }

  it("is set in a band just below the view, never with the lava on screen or far below", async () => {
    await mount();
    const rows = await sweep();
    for (const r of rows) expect(typeof r.near).toBe("boolean");
    const nearRows = rows.filter((r) => r.near);
    expect(nearRows.length).toBeGreaterThan(0);
    // Never both at once, never near when far below.
    for (const r of rows) expect(r.near && r.onScreen).toBe(false);
    // One contiguous band whose width is the proximity band (1 m sweep step).
    const first = nearRows[0]!.gap;
    const last = nearRows[nearRows.length - 1]!.gap;
    expect(last - first + 1).toBe(nearRows.length);
    expect(nearRows.length).toBeGreaterThanOrEqual(LAVA_PROXIMITY_M - 2);
    expect(nearRows.length).toBeLessThanOrEqual(LAVA_PROXIMITY_M + 1);
    // The band starts where the lava leaves the view. At most one 1 m sample
    // between them: the lava sitting exactly ON the visible bottom line is
    // neither on screen (fill 0) nor below it (gap 0) — a zero-width seam.
    const onScreenRows = rows.filter((r) => r.onScreen);
    expect(onScreenRows.length).toBeGreaterThan(0);
    const lastOnScreen = Math.max(...onScreenRows.map((r) => r.gap));
    expect(first - lastOnScreen).toBeGreaterThanOrEqual(1);
    expect(first - lastOnScreen).toBeLessThanOrEqual(2);
    expect(rows[rows.length - 1]!.near).toBe(false);
  });

  it("is suppressed during a replay (no world audio without a user gesture)", async () => {
    fx.replaying = true;
    await mount();
    const rows = await sweep();
    // Strictly false on every row, so undefined does not count as suppressed.
    for (const r of rows) expect(r.near).toBe(false);
    // The surge cue fires on lavaOnScreen OR lavaNear; both must be off.
    for (const r of rows) expect(r.onScreen).toBe(false);
    // ...but the phase still flows (the HUD and cue memo read it).
    expect(lastCall().world?.lavaPhase).toBe(hazardPhase(fx.raceSeconds - fx.hazardSlowSeconds).phase);

    // Positive control on the SAME mounted scene and the same sweep: once the
    // run is live, the sweep does cross the proximity band. Without this the
    // assertions above would also pass if the sweep never reached the band.
    fx.replaying = false;
    const live = await sweep();
    expect(live.filter((r) => r.near === true).length).toBeGreaterThan(0);
  });
});
