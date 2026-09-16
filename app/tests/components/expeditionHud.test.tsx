import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExpeditionHud, HeightInstrument, LavaClearanceInstrument, UtilityControls } from "../../src/components/Game/ExpeditionHud";
import { ActivePowerStack } from "../../src/components/Game/PowerUpHud";
import { createMatch } from "../../src/game/simulation";
import { buildTower } from "../../src/game/towers";
import { durationTicks, jetpackFuelTicks } from "../../src/game/powerups";
import type { ActivePowerUp } from "../../src/game/types";

function player() {
  return createMatch({ seed: "expedition-hud", mode: "solo", tower: buildTower("indie-games"), playerIds: ["p1"] }).players[0]!;
}
const noop = () => {};

describe("live expedition instruments", () => {
  it("formats live height to one decimal without imposing a ceiling", () => {
    const html = renderToStaticMarkup(createElement(HeightInstrument, { height: 12345.678 }));
    expect(html).toContain("Height 12345.7 feet");
    expect(html).toContain("<strong>12345.7</strong>");
    expect(html).toMatch(/>FT<|>ft</);
  });

  it("derives clearance from the player's position and hazard, preserving negative values", () => {
    const p = player();
    p.y = 57.25;
    for (const [hazardY, expected] of [[12, "45.3"], [60, "-2.8"]] as const) {
      const html = renderToStaticMarkup(createElement(ExpeditionHud, { player: p, hazardY, tick: 0, muted: false, onToggleMute: noop, announcement: "", runId: 1 }));
      expect(html).toContain(`Lava clearance ${expected} feet`);
      expect(html).toContain("Height 57.3 feet");
    }
  });

  it("marks low clearance as danger without making it a health meter", () => {
    for (const [clearance, danger] of [[12, true], [-1, true], [12.1, false]] as const) {
      const html = renderToStaticMarkup(createElement(LavaClearanceInstrument, { clearance }));
      expect(html).toContain(`data-danger="${danger}"`);
      expect(html).not.toContain('role="progressbar"');
    }
  });
});

describe("passive power cartridges", () => {
  it("hides absent, expired, and exhausted powers", () => {
    const p = player();
    expect(renderToStaticMarkup(createElement(ActivePowerStack, { player: undefined, tick: 0 }))).toBe("");
    expect(renderToStaticMarkup(createElement(ActivePowerStack, { player: p, tick: 0 }))).toBe("");
    p.activePowerUps = [{ type: "rapid-climb", startTick: 0, durationTicks: durationTicks("rapid-climb") }];
    expect(renderToStaticMarkup(createElement(ActivePowerStack, { player: p, tick: durationTicks("rapid-climb") }))).toBe("");
    p.activePowerUps = [{ type: "jetpack", startTick: 0, durationTicks: durationTicks("jetpack"), fuelRemainingTicks: 0 }];
    expect(renderToStaticMarkup(createElement(ActivePowerStack, { player: p, tick: 1 }))).toBe("");
  });

  it("shows multiple live powers with distinct fuel/time and no activation buttons", () => {
    const p = player();
    p.activePowerUps = [
      { type: "jetpack", startTick: 0, durationTicks: durationTicks("jetpack"), fuelRemainingTicks: jetpackFuelTicks() },
      { type: "giant", startTick: 0, durationTicks: durationTicks("giant") },
    ] satisfies ActivePowerUp[];
    const html = renderToStaticMarkup(createElement(ActivePowerStack, { player: p, tick: 60 }));
    expect(html.match(/class="exp-cartridge"/g)).toHaveLength(2);
    expect(html).toContain("28.0s remaining, 7.5 gal fuel");
    expect(html).toContain("Giant, 18.0s remaining");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("tabindex");
  });
});

describe("utility controls", () => {
  it("exposes mute state and labels and only shows fullscreen when supported", () => {
    const quiet = renderToStaticMarkup(createElement(UtilityControls, { muted: true, onToggleMute: noop, fullscreenSupported: false, onToggleFullscreen: noop }));
    expect(quiet).toContain('aria-label="Unmute game sound"');
    expect(quiet).toContain('aria-pressed="true"');
    expect(quiet.match(/<button/g)).toHaveLength(1);
    const full = renderToStaticMarkup(createElement(UtilityControls, { muted: false, onToggleMute: noop, fullscreenSupported: true, isFullscreen: true, onToggleFullscreen: noop }));
    expect(full).toContain('aria-label="Mute game sound"');
    expect(full).toContain('aria-pressed="false"');
    expect(full).toContain('aria-label="Exit full screen"');
    expect(full.match(/<button/g)).toHaveLength(2);
  });
});
