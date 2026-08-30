/**
 * AC-1–AC-17 power-up visual identity. Invokes PowerUpHud, ClimbControlsGuide,
 * drawPowerUpOrb, and drawPickupBanner. Imports production catalogs — does not
 * clone them or grep app/src for former glyphs.
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
  PICKUP_FLASH_TICKS,
  drawPickupBanner,
  drawPowerUpOrb,
  pickupBannerScale,
} from "../../src/components/Game/powerUpVfx";
import {
  POWER_UP_ICON_GEOMETRY,
  POWER_UP_ORB_BODIES,
  emitPathCommand,
  type PathSink,
} from "../../src/components/Game/powerUpVisuals";
import {
  DOUBLE_JUMP_CHARGES,
  JETPACK_FUEL_SECONDS,
  JETPACK_MAX_VY,
  POWER_UP_SPECS,
  POWER_UP_TYPES,
  durationTicks,
  jetpackFuelTicks,
} from "../../src/game/powerups";
import { TICK_HZ, type ActivePowerUp, type PowerUpPickup, type PowerUpType } from "../../src/game/types";

describe("AC-1 six-chip HUD", () => {
  it("each chip has svg[data-power-up-type] plus spec.label", () => {
    const html = renderHudWithActive(allActiveEntries(), 0);
    const chips = hudChips(html);
    expect(chips).toHaveLength(POWER_UP_TYPES.length);
    for (const type of POWER_UP_TYPES) {
      const chip = chips.find((c) => c.ariaLabel.startsWith(POWER_UP_SPECS[type].label));
      expect(chip, `missing chip for ${type}`).toBeDefined();
      expect(dataPowerUpTypes(chip!.html)).toEqual([type]);
      expect(textContent(chip!.html)).toContain(POWER_UP_SPECS[type].label);
    }
  });
});

describe("AC-2 only rapid-climb active", () => {
  it("emits exactly one data-power-up-type, value rapid-climb", () => {
    const html = renderHudWithActive(
      [activeEntry("rapid-climb")],
      0
    );
    expect(dataPowerUpTypes(html)).toEqual(["rapid-climb"]);
    expect(html).not.toContain('data-power-up-type="jetpack"');
    expect(html).not.toContain('data-power-up-type="sprint-burst"');
    expect(html).not.toContain('data-power-up-type="double-jump"');
    expect(html).not.toContain('data-power-up-type="giant"');
    expect(html).not.toContain('data-power-up-type="slow-lava"');
  });
});

describe("AC-3 decorative mark and jetpack fuel/window copy", () => {
  it("aria-hides the mark and starts aria-label with spec.label", () => {
    const html = renderHudWithActive(allActiveEntries(), 0);
    for (const chip of hudChips(html)) {
      expect(everySvgIsDecorative(chip.html)).toBe(true);
    }
    for (const type of POWER_UP_TYPES) {
      const chip = hudChips(html).find((c) =>
        c.ariaLabel.startsWith(POWER_UP_SPECS[type].label)
      );
      expect(chip?.ariaLabel.startsWith(POWER_UP_SPECS[type].label)).toBe(true);
    }
  });

  it("jetpack after 1s with no burn shows 7.5 gal fuel and 29.0s remaining", () => {
    const html = renderHudWithActive([activeEntry("jetpack")], TICK_HZ);
    expect(visibleChipSeconds(html)).toEqual(["7.5 gal", "29.0s"]);
    const chip = hudChips(html)[0];
    expect(chip).toBeDefined();
    expect(chip!.ariaLabel.startsWith(POWER_UP_SPECS.jetpack.label)).toBe(true);
    expect(chip!.ariaLabel).toMatch(/7\.5 gal fuel/i);
    expect(chip!.ariaLabel).toMatch(/29\.0s remaining/);
    expect(everySvgIsDecorative(chip!.html)).toBe(true);
  });
});

describe("AC-4 empty HUD and former-glyph retirement", () => {
  it("empty HUD shows copy, zero type marks, and no former-glyph text", () => {
    const html = renderHudWithActive([], 0);
    expect(textContent(html)).toContain("climbing — grab a glowing orb");
    expect(dataPowerUpTypes(html)).toEqual([]);
    expect(formerGlyphsInText(chipRowText(html))).toEqual([]);
  });

  it("six-chip HUD has no former-glyph text nodes in chips", () => {
    const html = renderHudWithActive(allActiveEntries(), 0);
    for (const chip of hudChips(html)) {
      expect(formerGlyphsInText(textContent(chip.html))).toEqual([]);
    }
  });
});

describe("AC-5 card guide lists every live type", () => {
  beforeEach(() => {
    vi.mocked(useCoarsePointer).mockReturnValue(false);
  });

  it("has an svg, label, and description per POWER_UP_TYPES", () => {
    const html = renderGuide();
    const types = dataPowerUpTypes(html);
    expect(types).toEqual([...POWER_UP_TYPES]);
    for (const type of POWER_UP_TYPES) {
      expect(html).toContain(`data-power-up-type="${type}"`);
      expect(textContent(html)).toContain(POWER_UP_SPECS[type].label);
      expect(textContent(html)).toContain(POWER_UP_SPECS[type].description);
    }
  });
});

describe("AC-6 jetpack/slow-lava suffixes and thrust copy", () => {
  beforeEach(() => {
    vi.mocked(useCoarsePointer).mockReturnValue(false);
  });

  it("keeps 7.5s fuel, 30s window, 40s recharge, and existing thrust copy", () => {
    const html = renderGuide();
    expect(html).toContain("7.5s fuel");
    expect(html).toContain("30s window");
    expect(html).toContain("40s recharge");
    expect(html).toMatch(/tap Space to leap/i);
    expect(html).toMatch(/re-hold in the air/i);
    expect(html).toMatch(/fuel is short/i);
    expect(html).toContain(`caps rise at ${JETPACK_MAX_VY} m/s`);
  });
});

describe("AC-7 guide former glyphs and compact/overlay omit marks", () => {
  beforeEach(() => {
    vi.mocked(useCoarsePointer).mockReturnValue(false);
  });

  it("card power-up rows have no former-glyph text nodes", () => {
    const html = renderGuide();
    const rows = guidePowerUpRows(html);
    expect(rows).toHaveLength(POWER_UP_TYPES.length);
    for (const row of rows) {
      expect(formerGlyphsInText(textContent(row))).toEqual([]);
    }
  });

  it("compact and overlay have zero data-power-up-type and keep control copy", () => {
    const compact = renderToStaticMarkup(
      createElement(ClimbControlsGuide, { variant: "compact" })
    );
    const overlay = renderToStaticMarkup(
      createElement(ClimbControlsGuide, { variant: "overlay" })
    );
    expect(dataPowerUpTypes(compact)).toEqual([]);
    expect(dataPowerUpTypes(overlay)).toEqual([]);
    expect(compact).toMatch(/Space/i);
    expect(compact).toMatch(/thrust/i);
    expect(overlay).toMatch(/Jump/i);
    expect(overlay).toMatch(/thrust/i);
  });
});

describe("AC-8 orb fillText is label uppercase, never a former glyph", () => {
  it("fillText per type equals LABEL and contains no former glyphs", () => {
    for (const type of POWER_UP_TYPES) {
      const rec = recordOrb(type, { reducedMotion: false, cooling: false });
      const texts = fillTextArgs(rec);
      expect(texts).toContain(POWER_UP_SPECS[type].label.toUpperCase());
      for (const text of texts) {
        expect(containsFormerGlyph(text)).toBe(false);
      }
    }
  });
});

describe("AC-9 POWER_UP_ICON_GEOMETRY pairwise unique", () => {
  it("imports the production catalog: size 6, pairwise deep-unequal", () => {
    expect(Object.keys(POWER_UP_ICON_GEOMETRY)).toHaveLength(6);
    const serialized = new Set(
      POWER_UP_TYPES.map((type) => JSON.stringify(POWER_UP_ICON_GEOMETRY[type]))
    );
    expect(serialized.size).toBe(6);
    assertPairwiseUnequal(POWER_UP_TYPES.map((type) => POWER_UP_ICON_GEOMETRY[type]));
  });
});

describe("AC-10 POWER_UP_ORB_BODIES pairwise unique, not a shared diamond", () => {
  it("imports the production catalog: size 6, distinct bodies", () => {
    expect(Object.keys(POWER_UP_ORB_BODIES)).toHaveLength(6);
    const bodies = POWER_UP_TYPES.map((type) => POWER_UP_ORB_BODIES[type]);
    expect(new Set(bodies).size).toBe(6);
    const serialized = new Set(bodies.map((body) => JSON.stringify(body)));
    expect(serialized.size).toBe(6);
    assertPairwiseUnequal(bodies);
    const commandLengths = new Set(bodies.map((body) => body.commands.length));
    expect(commandLengths.size).toBeGreaterThan(1);
  });
});

describe("AC-11 reduced-motion orb recording", () => {
  it("second call matches; icon path commands present; cooling dims alpha", () => {
    for (const type of POWER_UP_TYPES) {
      const first = recordOrb(type, { reducedMotion: true, cooling: false });
      const second = recordOrb(type, { reducedMotion: true, cooling: false });
      expect(fillTextArgs(first)).toEqual(fillTextArgs(second));
      expect(iconPathCalls(first)).toEqual(iconPathCalls(second));
      expect(first.calls).toEqual(second.calls);

      const expectedIcon = catalogIconPathCalls(type);
      expect(expectedIcon.length).toBeGreaterThan(0);
      expect(isPathSubsequence(pathGeometryCalls(first), expectedIcon)).toBe(
        true
      );
      for (const text of fillTextArgs(first)) {
        expect(containsFormerGlyph(text)).toBe(false);
      }

      const cooled = recordOrb(type, { reducedMotion: true, cooling: true });
      expect(isPathSubsequence(pathGeometryCalls(cooled), expectedIcon)).toBe(
        true
      );
      expect(fillTextArgs(cooled)).toContain(
        POWER_UP_SPECS[type].label.toUpperCase()
      );
      const hotMax = Math.max(...globalAlphas(first));
      const coolMax = Math.max(...globalAlphas(cooled));
      expect(coolMax).toBeLessThan(hotMax);
      expect(coolMax).toBeCloseTo(0.45, 5);
    }
  });
});

describe("AC-12 banner fillText is LABEL and DESCRIPTION uppercase", () => {
  it("includes uppercase copy and no glyph-prefixed title", () => {
    for (const type of POWER_UP_TYPES) {
      const rec = recordBanner(type, { reducedMotion: false });
      const texts = fillTextArgs(rec);
      expect(texts).toContain(POWER_UP_SPECS[type].label.toUpperCase());
      expect(texts).toContain(POWER_UP_SPECS[type].description.toUpperCase());
      for (const text of texts) {
        expect(containsFormerGlyph(text)).toBe(false);
        for (const glyph of FORMER_GLYPHS) {
          expect(text === `${glyph} ${POWER_UP_SPECS[type].label}`).toBe(false);
          expect(text.startsWith(`${glyph} `)).toBe(false);
        }
      }
    }
  });
});

describe("AC-13 reduced-motion banner still draws the icon", () => {
  it("icon subsequence present, scale is 1, no former glyphs", () => {
    const age = 10;
    expect(age).toBeGreaterThan(0);
    expect(age).toBeLessThan(PICKUP_FLASH_TICKS);
    const t = age / PICKUP_FLASH_TICKS;
    expect(pickupBannerScale(t, true)).toBe(1);

    for (const type of POWER_UP_TYPES) {
      const rec = recordBanner(type, { reducedMotion: true, age });
      expect(isPathSubsequence(pathGeometryCalls(rec), catalogIconPathCalls(type))).toBe(
        true
      );
      expect(scaleCalls(rec).some((args) => args[0] === 1 && args[1] === 1)).toBe(
        true
      );
      for (const text of fillTextArgs(rec)) {
        expect(containsFormerGlyph(text)).toBe(false);
      }
    }
  });
});

describe("AC-14 jetpack banner is not the concatenated glyph title", () => {
  it("fillText never equals ▲ JETPACK and never contains ▲", () => {
    expect(containsFormerGlyph("▲ JETPACK")).toBe(true);
    const rec = recordBanner("jetpack", { reducedMotion: false });
    for (const text of fillTextArgs(rec)) {
      expect(text).not.toBe("▲ JETPACK");
      expect(text.includes("▲")).toBe(false);
    }
  });
});

describe("AC-15 locked type set and hex colors", () => {
  it("POWER_UP_TYPES is exactly the six strings and colors match", () => {
    expect(POWER_UP_TYPES).toEqual([
      "rapid-climb",
      "sprint-burst",
      "double-jump",
      "giant",
      "jetpack",
      "slow-lava",
    ]);
    expect(POWER_UP_SPECS["rapid-climb"].color).toBe("#4dd9f2");
    expect(POWER_UP_SPECS["sprint-burst"].color).toBe("#f2d24d");
    expect(POWER_UP_SPECS["double-jump"].color).toBe("#a98cf5");
    expect(POWER_UP_SPECS.giant.color).toBe("#b8f57c");
    expect(POWER_UP_SPECS.jetpack.color).toBe("#ff9a4a");
    expect(POWER_UP_SPECS["slow-lava"].color).toBe("#ff8ad4");
  });
});

describe("AC-16 locked durations, fuel, and cooldown", () => {
  it("matches the locked table; HUD empty copy and guide suffixes still match", () => {
    expect(POWER_UP_SPECS["rapid-climb"].label).toBe("Rapid Climb");
    expect(POWER_UP_SPECS["rapid-climb"].description).toBe(
      "Climb ladders 1.75x faster"
    );
    expect(POWER_UP_SPECS["rapid-climb"].durationSeconds).toBe(10);

    expect(POWER_UP_SPECS["sprint-burst"].label).toBe("Sprint Burst");
    expect(POWER_UP_SPECS["sprint-burst"].description).toBe("Run 1.5x faster");
    expect(POWER_UP_SPECS["sprint-burst"].durationSeconds).toBe(10);

    expect(POWER_UP_SPECS["double-jump"].label).toBe("Double Jump");
    expect(POWER_UP_SPECS["double-jump"].description).toBe(
      `${DOUBLE_JUMP_CHARGES} extra jumps in mid-air`
    );
    expect(POWER_UP_SPECS["double-jump"].durationSeconds).toBe(18);

    expect(POWER_UP_SPECS.giant.label).toBe("Giant");
    expect(POWER_UP_SPECS.giant.description).toBe(
      "2× size · wider grabs & landings"
    );
    expect(POWER_UP_SPECS.giant.durationSeconds).toBe(20);

    expect(POWER_UP_SPECS.jetpack.label).toBe("Jetpack");
    expect(POWER_UP_SPECS.jetpack.description).toBe(
      "Hold jump to thrust (7.5s fuel)"
    );
    expect(POWER_UP_SPECS.jetpack.durationSeconds).toBe(30);
    expect(POWER_UP_SPECS.jetpack.fuelSeconds).toBe(7.5);
    expect(JETPACK_FUEL_SECONDS).toBe(7.5);

    expect(POWER_UP_SPECS["slow-lava"].label).toBe("Slow Lava");
    expect(POWER_UP_SPECS["slow-lava"].description).toBe(
      "Lava rises 40% slower"
    );
    expect(POWER_UP_SPECS["slow-lava"].durationSeconds).toBe(8);
    expect(POWER_UP_SPECS["slow-lava"].cooldownSeconds).toBe(40);

    const empty = renderHudWithActive([], 0);
    expect(textContent(empty)).toContain("climbing — grab a glowing orb");
    const guide = renderGuide();
    expect(guide).toContain("7.5s fuel");
    expect(guide).toContain("30s window");
    expect(guide).toContain("40s recharge");
  });
});

describe("AC-17 decorative SVGs unnamed", () => {
  it("HUD, guide, orb, and banner stay on live types with hidden marks", () => {
    expect(POWER_UP_TYPES).toHaveLength(6);
    const hud = renderHudWithActive(allActiveEntries(), 0);
    expect(dataPowerUpTypes(hud)).toHaveLength(6);
    expect(everySvgIsDecorative(hud)).toBe(true);
    for (const chip of hudChips(hud)) {
      expect(chip.ariaLabel.toLowerCase()).not.toContain("svg");
      expect(chip.ariaLabel.toLowerCase()).not.toMatch(/\bicon\b/);
    }

    const guide = renderGuide();
    expect(dataPowerUpTypes(guide)).toHaveLength(6);
    expect(everySvgIsDecorative(guide)).toBe(true);

    for (const type of POWER_UP_TYPES) {
      expect(POWER_UP_SPECS[type].color).toBe(LOCKED_COLORS[type]);
    }
  });
});

describe("former-glyph matcher (negative-guard fixture)", () => {
  it("rejects the retired marks and the concatenated jetpack title", () => {
    expect(FORMER_GLYPHS).toEqual(["⇈", "»", "⇡", "◉", "▲", "◷"]);
    for (const glyph of FORMER_GLYPHS) {
      expect(containsFormerGlyph(glyph)).toBe(true);
    }
    expect(containsFormerGlyph("▲ JETPACK")).toBe(true);
    expect(containsFormerGlyph("JETPACK")).toBe(false);
    expect(containsFormerGlyph("Rapid Climb")).toBe(false);
  });
});

const FORMER_GLYPHS = ["⇈", "»", "⇡", "◉", "▲", "◷"] as const;

const LOCKED_COLORS: Record<PowerUpType, string> = {
  "rapid-climb": "#4dd9f2",
  "sprint-burst": "#f2d24d",
  "double-jump": "#a98cf5",
  giant: "#b8f57c",
  jetpack: "#ff9a4a",
  "slow-lava": "#ff8ad4",
};

const PATH_GEOMETRY_METHODS = new Set([
  "moveTo",
  "lineTo",
  "quadraticCurveTo",
  "bezierCurveTo",
  "closePath",
]);

const ORB_DRAW = {
  cx: 120,
  baseY: 240,
  pxPerM: 12,
  ui: 1,
  tick: 42,
} as const;

type RecordedCall = {
  method: string;
  args: readonly unknown[];
};

type Recording = {
  calls: RecordedCall[];
  ctx: CanvasRenderingContext2D;
};

function renderHudWithActive(active: ActivePowerUp[], tick: number): string {
  return renderToStaticMarkup(
    createElement(PowerUpHud, {
      player: { activePowerUps: active } as Parameters<
        typeof PowerUpHud
      >[0]["player"],
      tick,
      muted: false,
      onToggleMute: () => {},
      announcement: "",
      runId: 1,
    })
  );
}

function renderGuide(): string {
  return renderToStaticMarkup(createElement(ClimbControlsGuide, {}));
}

function allActiveEntries(): ActivePowerUp[] {
  return POWER_UP_TYPES.map((type) => activeEntry(type));
}

function activeEntry(type: PowerUpType): ActivePowerUp {
  const entry: ActivePowerUp = {
    type,
    startTick: 0,
    durationTicks: durationTicks(type),
  };
  if (type === "jetpack") {
    entry.fuelRemainingTicks = jetpackFuelTicks();
  }
  if (type === "double-jump") {
    entry.chargesRemaining = DOUBLE_JUMP_CHARGES;
  }
  return entry;
}

function hudChips(html: string): { ariaLabel: string; html: string }[] {
  const chips: { ariaLabel: string; html: string }[] = [];
  const re = /aria-label="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const ariaLabel = match[1]!;
    const spanStart = html.lastIndexOf("<span", match.index);
    if (spanStart < 0) continue;
    const innerStart = html.indexOf(">", spanStart) + 1;
    const tabular = html.indexOf('class="tabular-nums"', innerStart);
    if (tabular < 0) continue;
    const chipEnd = html.indexOf("</span>", tabular);
    chips.push({
      ariaLabel,
      html: html.slice(spanStart, chipEnd + "</span>".length),
    });
  }
  return chips;
}

function dataPowerUpTypes(html: string): string[] {
  return [...html.matchAll(/data-power-up-type="([^"]+)"/g)].map(
    (match) => match[1]!
  );
}

function textContent(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "));
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

function chipRowText(html: string): string {
  const rowOpen = html.indexOf("overflow-x-auto");
  const button = html.indexOf("<button", rowOpen);
  const slice = html.slice(rowOpen, button < 0 ? html.length : button);
  return textContent(slice);
}

function visibleChipSeconds(html: string): string[] {
  return [...html.matchAll(/class="[^"]*tabular-nums[^"]*">([^<]+)</g)].map(
    (match) => match[1]!
  );
}

function everySvgIsDecorative(html: string): boolean {
  const re = /<svg\b/g;
  let match: RegExpExecArray | null;
  let count = 0;
  while ((match = re.exec(html))) {
    count += 1;
    const tagEnd = html.indexOf(">", match.index);
    const tag = html.slice(match.index, tagEnd + 1);
    if (/\baria-hidden="true"/.test(tag)) continue;
    const before = html.slice(0, match.index);
    const wraps = [...before.matchAll(/<span\b([^>]*)>/g)];
    const last = wraps[wraps.length - 1];
    if (last && /\baria-hidden="true"/.test(last[1]!)) continue;
    return false;
  }
  return count > 0;
}

function guidePowerUpRows(html: string): string[] {
  const heading = html.indexOf("Power-ups");
  if (heading < 0) return [];
  const ulStart = html.indexOf("<ul", heading);
  const ulEnd = html.indexOf("</ul>", ulStart);
  const list = html.slice(ulStart, ulEnd + 5);
  return [...list.matchAll(/<li\b[\s\S]*?<\/li>/g)].map((match) => match[0]!);
}

function containsFormerGlyph(text: string): boolean {
  return FORMER_GLYPHS.some((glyph) => text.includes(glyph));
}

function formerGlyphsInText(text: string): string[] {
  return FORMER_GLYPHS.filter((glyph) => text.includes(glyph));
}

function assertPairwiseUnequal(values: readonly unknown[]): void {
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      expect(values[i]).not.toEqual(values[j]);
    }
  }
}

function recordOrb(
  type: PowerUpType,
  opts: { reducedMotion: boolean; cooling: boolean }
): Recording {
  const rec = createRecordingContext();
  drawPowerUpOrb(
    rec.ctx,
    ORB_DRAW.cx,
    ORB_DRAW.baseY,
    ORB_DRAW.pxPerM,
    ORB_DRAW.ui,
    orbPickup(type),
    ORB_DRAW.tick,
    opts.reducedMotion,
    opts.cooling
  );
  return rec;
}

function recordBanner(
  type: PowerUpType,
  opts: { reducedMotion: boolean; age?: number }
): Recording {
  const rec = createRecordingContext();
  const age = opts.age ?? 10;
  drawPickupBanner(
    rec.ctx,
    400,
    46,
    1,
    POWER_UP_SPECS[type],
    age,
    opts.reducedMotion
  );
  return rec;
}

function orbPickup(type: PowerUpType): PowerUpPickup {
  const floorIndex = POWER_UP_TYPES.indexOf(type) + 1;
  return {
    id: `pu:${floorIndex}`,
    type,
    floorIndex,
    x: 0,
    y: 10,
    collected: false,
    collectedTick: null,
  };
}

function fillTextArgs(rec: Recording): string[] {
  return rec.calls
    .filter((call) => call.method === "fillText")
    .map((call) => String(call.args[0] ?? ""));
}

function globalAlphas(rec: Recording): number[] {
  return rec.calls
    .filter((call) => call.method === "set:globalAlpha")
    .map((call) => Number(call.args[0]));
}

function scaleCalls(rec: Recording): number[][] {
  return rec.calls
    .filter((call) => call.method === "scale")
    .map((call) => call.args.map(Number));
}

function pathGeometryCalls(rec: Recording): RecordedCall[] {
  return rec.calls.filter((call) => PATH_GEOMETRY_METHODS.has(call.method));
}

function iconPathCalls(rec: Recording): RecordedCall[] {
  return pathGeometryCalls(rec).filter((call) => isIconSpaceCall(call));
}

function catalogIconPathCalls(type: PowerUpType): RecordedCall[] {
  const expected: RecordedCall[] = [];
  const sink: PathSink = {
    moveTo(x, y) {
      expected.push({ method: "moveTo", args: [x, y] });
    },
    lineTo(x, y) {
      expected.push({ method: "lineTo", args: [x, y] });
    },
    quadraticCurveTo(x1, y1, x, y) {
      expected.push({ method: "quadraticCurveTo", args: [x1, y1, x, y] });
    },
    bezierCurveTo(x1, y1, x2, y2, x, y) {
      expected.push({ method: "bezierCurveTo", args: [x1, y1, x2, y2, x, y] });
    },
    closePath() {
      expected.push({ method: "closePath", args: [] });
    },
  };
  for (const layer of POWER_UP_ICON_GEOMETRY[type].layers) {
    for (const cmd of layer.commands) {
      emitPathCommand(cmd, sink);
    }
  }
  return expected;
}

function isPathSubsequence(haystack: RecordedCall[], needle: RecordedCall[]): boolean {
  let i = 0;
  for (const call of haystack) {
    if (i >= needle.length) break;
    if (sameCall(call, needle[i]!)) i += 1;
  }
  return i === needle.length;
}

function sameCall(a: RecordedCall, b: RecordedCall): boolean {
  if (a.method !== b.method) return false;
  if (a.args.length !== b.args.length) return false;
  return a.args.every((value, index) => value === b.args[index]);
}

function isIconSpaceCall(call: RecordedCall): boolean {
  if (call.method === "closePath") return true;
  return call.args.every((value) => {
    if (typeof value !== "number") return false;
    return value >= 0 && value <= 24;
  });
}

function createRecordingContext(): Recording {
  const calls: RecordedCall[] = [];
  const state: Record<string, unknown> = {
    globalAlpha: 1,
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
  };
  const methodNames = [
    "fillText",
    "beginPath",
    "moveTo",
    "lineTo",
    "quadraticCurveTo",
    "bezierCurveTo",
    "arc",
    "ellipse",
    "closePath",
    "fill",
    "stroke",
    "save",
    "restore",
    "translate",
    "scale",
    "rotate",
    "setLineDash",
    "measureText",
  ] as const;

  const target: Record<string, unknown> = { calls };
  for (const name of methodNames) {
    target[name] = (...args: unknown[]) => {
      calls.push({ method: name, args });
      if (name === "measureText") {
        return { width: String(args[0] ?? "").length * 8 };
      }
      return undefined;
    };
  }

  const ctx = new Proxy(target, {
    get(obj, prop) {
      if (typeof prop === "string" && prop in obj) return obj[prop];
      if (typeof prop === "string" && prop in state) return state[prop];
      if (typeof prop === "string") {
        return (...args: unknown[]) => {
          calls.push({ method: prop, args });
        };
      }
      return undefined;
    },
    set(_obj, prop, value) {
      if (typeof prop === "string") {
        calls.push({ method: `set:${prop}`, args: [value] });
        state[prop] = value;
      }
      return true;
    },
  });

  return { calls, ctx: ctx as unknown as CanvasRenderingContext2D };
}
