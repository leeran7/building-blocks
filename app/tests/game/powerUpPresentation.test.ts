/**
 * AC-J11 / AC-J12 presentation: HUD fuel chip, guide copy, and audio type gate.
 *
 * powerUpChipMeter is not a contract until PowerUpHud calls it. Guide copy is
 * not a contract until ClimbControlsGuide renders it. These tests invoke the
 * production components rather than grepping their source.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/hooks/useCoarsePointer", () => ({
  useCoarsePointer: vi.fn(() => false),
}));

import { useCoarsePointer } from "../../src/hooks/useCoarsePointer";
import { ClimbControlsGuide } from "../../src/components/Game/ClimbControlsGuide";
import { PowerUpHud } from "../../src/components/Game/PowerUpHud";
import {
  DEATH_HIT_ATTACK,
  DEATH_HIT_PEAK,
  LAVA_STING_ATTACK,
  LAVA_STING_PEAK,
  PowerUpAudio,
  jetpackLoopGain,
  lavaDoomAttackSeconds,
  lavaDoomLoopGain,
} from "../../src/components/Game/powerUpAudio";
import {
  JETPACK_FUEL_SECONDS,
  JETPACK_MAX_VY,
  POWER_UP_HOVER_M,
  POWER_UP_SPECS,
  POWER_UP_TYPES,
  jetpackFuelTicks,
} from "../../src/game/powerups";
import {
  createMatch,
  stepMatch,
} from "../../src/game/simulation";
import { NO_INPUT, TICK_HZ } from "../../src/game/types";
import { buildTower } from "../../src/game/towers";

const JUMP = { moveX: 0, jump: true, climbY: 0, usePowerUp: false } as const;

function climbingHudMatch() {
  const tower = buildTower("indie-games");
  const m = createMatch({
    seed: "hud-jetpack",
    mode: "solo",
    tower,
    playerIds: ["p1"],
  });
  m.phase = "climb";
  m.tick = 0;
  m.powerUps = [];
  m.powerUpFloorHi = 100_000;
  const p = m.players[0]!;
  m.powerUps.push({
    id: "test:jetpack",
    type: "jetpack",
    floorIndex: 0,
    x: p.x,
    y: p.y + POWER_UP_HOVER_M,
    collected: false,
    collectedTick: null,
  });
  stepMatch(m, { p1: NO_INPUT });
  return m;
}

function renderHud(
  player: ReturnType<typeof climbingHudMatch>["players"][0],
  tick: number
): string {
  return renderToStaticMarkup(
    createElement(PowerUpHud, {
      player,
      tick,
      muted: false,
      onToggleMute: () => {},
      announcement: "",
      runId: 1,
    })
  );
}

describe("AC-J11 PowerUpHud calls powerUpChipMeter", () => {
  it("shows fuel on the chip and names fuel plus window in the aria-label", () => {
    const m = climbingHudMatch();
    const p = m.players[0]!;
    for (let i = 0; i < TICK_HZ; i++) stepMatch(m, { p1: NO_INPUT });
    const html = renderHud(p, m.tick);
    const fuelText = `${JETPACK_FUEL_SECONDS.toFixed(1)}s`;
    const windowLeft = (
      POWER_UP_SPECS.jetpack.durationSeconds - 1
    ).toFixed(1);
    expect(visibleChipSeconds(html)).toEqual([fuelText]);
    expect(visibleChipSeconds(html)).not.toContain(`${windowLeft}s`);
    expect(html).toMatch(
      new RegExp(`${JETPACK_FUEL_SECONDS.toFixed(1)}s fuel`, "i")
    );
    expect(html).toMatch(new RegExp(`${windowLeft}s remaining`, "i"));
    expect(html).toContain(POWER_UP_SPECS.jetpack.label);
  });

  it("keeps the visible numeral on the tank after a partial burn", () => {
    const m = climbingHudMatch();
    const p = m.players[0]!;
    stepMatch(m, { p1: JUMP });
    for (let i = 0; i < 20; i++) stepMatch(m, { p1: JUMP });
    const html = renderHud(p, m.tick);
    const fuelLeft = jetpackFuelTicks() - 20;
    const fuelSeconds = (fuelLeft / TICK_HZ).toFixed(1);
    expect(visibleChipSeconds(html)).toEqual([`${fuelSeconds}s`]);
    expect(html).toMatch(new RegExp(`${fuelSeconds}s fuel`, "i"));
    expect(html).toMatch(/s remaining/);
  });
});

describe("AC-J12 ClimbControlsGuide copy", () => {
  beforeEach(() => {
    vi.mocked(useCoarsePointer).mockReturnValue(false);
  });

  it("renders hold-to-thrust copy, a short-fuel tip, and the fuel·window suffix", () => {
    const html = renderToStaticMarkup(createElement(ClimbControlsGuide, {}));
    expect(html).toMatch(/tap Space to leap/i);
    expect(html).toMatch(/re-hold in the air/i);
    expect(html).toMatch(/tap jump to leap/i);
    expect(html).toMatch(/fuel is short/i);
    expect(html).toMatch(
      new RegExp(`caps rise at ${JETPACK_MAX_VY} m/s`)
    );
    expect(html).toContain(`${JETPACK_FUEL_SECONDS}s fuel`);
    expect(html).toContain(`${POWER_UP_SPECS.jetpack.durationSeconds}s window`);
    expect(html).toContain(POWER_UP_SPECS.jetpack.description);
  });

  it("tells touch players to re-hold JMP in the air to thrust", () => {
    vi.mocked(useCoarsePointer).mockReturnValue(true);
    const html = renderToStaticMarkup(createElement(ClimbControlsGuide, {}));
    expect(html).toMatch(/re-hold JMP in the air to thrust/i);
  });
});

describe("AC-J11 audio accepts every live PowerUpType including jetpack", () => {
  it("play() does not throw for pickup and activate on each live type", () => {
    expect(POWER_UP_TYPES).toContain("jetpack");
    const audio = new PowerUpAudio();
    for (const type of POWER_UP_TYPES) {
      expect(() => audio.play("pickup", type)).not.toThrow();
      expect(() => audio.play("activate", type)).not.toThrow();
    }
  });
});

describe("world SFX: jetpack loop, lava doom, death hit", () => {
  it("loop and one-shot methods do not throw without a Web Audio context", () => {
    const audio = new PowerUpAudio();
    expect(() => audio.setJetpackThrusting(true)).not.toThrow();
    expect(() => audio.setJetpackThrusting(false)).not.toThrow();
    expect(() => audio.setLavaDoom(true, 0.4)).not.toThrow();
    expect(() => audio.setLavaDoom(false, 0)).not.toThrow();
    expect(() => audio.playLavaSting()).not.toThrow();
    expect(() => audio.playDeath()).not.toThrow();
    audio.dispose();
  });

  it("doom-struck is louder and faster than doom-is-coming", () => {
    expect(DEATH_HIT_PEAK).toBeGreaterThan(LAVA_STING_PEAK);
    expect(DEATH_HIT_ATTACK).toBeLessThan(LAVA_STING_ATTACK);
    expect(LAVA_STING_ATTACK).toBeGreaterThan(2);
    expect(DEATH_HIT_ATTACK).toBeLessThan(0.02);
  });

  it("jetpack loop is a whoosh, not a thud", () => {
    expect(jetpackLoopGain(false)).toBe(0);
    expect(jetpackLoopGain(true)).toBeGreaterThan(0.08);
    expect(jetpackLoopGain(true)).toBeLessThan(0.25);
  });

  it("lava rumble starts as a whisper and grows with fill", () => {
    expect(lavaDoomLoopGain(0)).toBe(0);
    expect(lavaDoomLoopGain(-1)).toBe(0);
    const whisper = lavaDoomLoopGain(0.05);
    const roar = lavaDoomLoopGain(1);
    expect(whisper).toBeGreaterThan(0);
    expect(whisper).toBeLessThan(0.08);
    expect(roar).toBeGreaterThan(whisper * 3);
    expect(lavaDoomLoopGain(2)).toBe(roar);
    expect(lavaDoomAttackSeconds()).toBeGreaterThan(3);
  });
});

function visibleChipSeconds(html: string): string[] {
  return [...html.matchAll(/class="tabular-nums">([^<]+)</g)].map(
    (match) => match[1]!
  );
}
