/**
 * What a level shows about its power-ups and its clock.
 *
 * The level start sheet tells the player, before the match, how often orbs
 * turn up on this level and how long each lasts here. Renders the real card
 * from the real catalog entry.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
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
  // The sheet portals to the body, so it is mounted for real and read back
  // from the document.
  const mount = (n: number) => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        createElement(LevelStartSheet, {
          node: { ...catalog.level(n), stars: 0, bestMs: null },
          player: { lives: 5, maxLives: 5, nextLifeAt: null, xp: 0, playerLevel: 1, xpIntoLevel: 0, xpForNext: 100 },
          onStart: async () => ({ ok: false as const, code: "NETWORK" as const }),
          onPractice: () => {},
          onPracticeLevel: () => {},
          onClose: () => {},
        })
      )
    );
    const dialog = document.querySelector('[role="dialog"]');
    const unmount = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { host, dialog, unmount };
  };
  const sheet = (n: number): string => {
    const { dialog, unmount } = mount(n);
    const text = dialog?.textContent ?? "";
    unmount();
    return text;
  };

  it("shows the 1-star clock in place of any clear", () => {
    for (const n of [1, 20, 300]) {
      expect(sheet(n)).toContain(formatClock(catalog.level(n).pars.oneStarMs!));
      expect(sheet(n)).not.toContain("any clear");
    }
  });

  it("shows the level's power-ups before the match", () => {
    expect(sheet(300)).toContain("Power-up every 20 floors");
  });

  it("renders over the page, not inside the screen that opened it", () => {
    // Inside the screen, the tab bar covered the bottom of the sheet and Play.
    const { host, dialog, unmount } = mount(5);
    expect(dialog).not.toBeNull();
    expect(host.contains(dialog)).toBe(false);
    unmount();
  });
});

describe("in-run goal bar", () => {
  const bar = (elapsedMs: number, oneStarMs: number | null) =>
    renderToStaticMarkup(
      createElement(GoalBar, {
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
