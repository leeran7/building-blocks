/**
 * What a level shows about its power-ups and its clock.
 *
 * The level start sheet tells the player, before the match, how often orbs
 * turn up on this level and how long each lasts here. Renders the real card
 * from the real catalog entry.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LevelStartSheet, PowerUpsCard } from "../../mobile/src/components/levels/LevelStartSheet";
import { GoalBar } from "../../mobile/src/components/levels/LevelRun";
import { season1Catalog } from "../../mobile/src/lib/levels/catalog";
import { formatClock } from "../../mobile/src/lib/levels/model";

const catalog = season1Catalog();
const render = (n: number) =>
  renderToStaticMarkup(createElement(PowerUpsCard, { powerUps: catalog.level(n).powerUps }))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

describe("level start sheet power-ups", () => {
  it("says a level has none", () => {
    expect(render(1)).toContain("No power-ups");
  });

  it("shows the level's rate and each type's seconds", () => {
    const text = render(300);
    expect(text).toContain("Power-up every 20 floors");
    expect(text).toContain("Slow Lava 4.8s");
    expect(text).toContain("Jetpack 4.5s fuel");
    expect(text).not.toContain("No power-ups");
  });

  it("shows an early level's longer window", () => {
    expect(render(4)).toMatch(/Power-up every 9 floors .*9\.8s/);
  });
});

describe("level start sheet", () => {
  const sheet = (n: number) =>
    renderToStaticMarkup(
      createElement(LevelStartSheet, {
        node: { ...catalog.level(n), stars: 0, bestMs: null },
        player: { lives: 5, maxLives: 5, nextLifeAt: null, xp: 0, playerLevel: 1, xpIntoLevel: 0, xpForNext: 100 },
        onStart: async () => ({ ok: false as const, code: "NETWORK" as const }),
        onPractice: () => {},
        onPracticeLevel: () => {},
        onClose: () => {},
      })
    ).replace(/<[^>]+>/g, " ");

  it("shows the 1-star clock in place of any clear", () => {
    for (const n of [1, 20, 300]) {
      expect(sheet(n)).toContain(formatClock(catalog.level(n).pars.oneStarMs!));
      expect(sheet(n)).not.toContain("any clear");
    }
  });

  it("shows the level's power-ups before the match", () => {
    const info = catalog.level(300);
    const html = renderToStaticMarkup(
      createElement(LevelStartSheet, {
        node: { ...info, stars: 0, bestMs: null },
        player: { lives: 5, maxLives: 5, nextLifeAt: null, xp: 0, playerLevel: 1, xpIntoLevel: 0, xpForNext: 100 },
        onStart: async () => ({ ok: false as const, code: "NETWORK" as const }),
        onPractice: () => {},
        onPracticeLevel: () => {},
        onClose: () => {},
      })
    );
    expect(html).toContain("Power-up every 20 floors");
  });
});

describe("in-run goal bar", () => {
  const bar = (elapsedMs: number, oneStarMs: number | null) =>
    renderToStaticMarkup(
      createElement(GoalBar, {
        topInset: 0,
        peakFt: 10,
        goalFt: 100,
        elapsedMs,
        pars: { threeStarMs: 28_000, twoStarMs: 36_000, oneStarMs },
        practice: false,
      })
    ).replace(/<[^>]+>/g, " ");

  it("counts down to the 1-star clock once 2 stars are gone", () => {
    expect(bar(40_000, 45_000)).toContain("0:05");
    expect(bar(40_000, null)).not.toMatch(/\d:\d\d/);
  });
});
