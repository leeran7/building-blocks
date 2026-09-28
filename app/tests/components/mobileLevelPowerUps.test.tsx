/**
 * The level start sheet tells the player, before the match, how often orbs
 * turn up on this level and how long each lasts here. Renders the real card
 * from the real catalog entry.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LevelStartSheet, PowerUpsCard } from "../../mobile/src/components/levels/LevelStartSheet";
import { season1Catalog } from "../../mobile/src/lib/levels/catalog";

const catalog = season1Catalog();
const render = (n: number) =>
  renderToStaticMarkup(createElement(PowerUpsCard, { powerUps: catalog.level(n).powerUps }))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

describe("level start sheet power-ups", () => {
  it("says a level has none", () => {
    expect(render(1)).toContain("None on this level");
  });

  it("shows the level's rate and each type's seconds", () => {
    const text = render(300);
    expect(text).toContain("About 1 every 20 floors");
    expect(text).toContain("Slow Lava 4.8s");
    expect(text).toContain("Jetpack 4.5s fuel");
    expect(text).not.toContain("None on this level");
  });

  it("shows an early level's longer window", () => {
    expect(render(4)).toMatch(/About 1 every 9 floors .*9\.8s/);
  });
});

describe("level start sheet", () => {
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
    expect(html).toContain("About 1 every 20 floors");
  });
});
