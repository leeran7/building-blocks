/**
 * Climb Feel 1.2× — surface DOM contracts (AC-3/5/6/7/8/9/10/11).
 * Renders production components via renderToStaticMarkup; no source-text greps.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false, signOut: async () => undefined }),
}));

vi.mock("../../src/hooks/useCoarsePointer", () => ({
  useCoarsePointer: vi.fn(() => false),
}));

vi.mock("../../src/db/climb", () => ({
  topFreeClimbers: vi.fn(),
}));

import { topFreeClimbers } from "../../src/db/climb";
import {
  CLIMB_PANEL_INTRO_TITLE_CLASS,
  FREE_CLIMB_RANK_CLASS,
  FREE_LEADERBOARD_HEADING_CLASS,
} from "../../src/design/climbFeelTokens";
import { FreeStackShell } from "../../src/components/FreeStackShell";
import { ClimbPanelIntro } from "../../src/components/Climb/ClimbPanelIntro";
import { ClimbLeaderboard } from "../../src/components/Climb/ClimbLeaderboard";
import {
  FreeClimbCard,
  FreeClimbEmpty,
} from "../../src/components/Dashboard/FreeClimbCard";
import { Hero } from "../../src/components/LandingPage/Hero";
import { FreeLeaderboard } from "../../src/components/LandingPage/FreeLeaderboard";
import { Footer } from "../../src/components/LandingPage/Footer";

const HERO_STATS = {
  totalBlocks: 12,
  minEntryUsd: 5,
  climberCount: 3,
  topPeak: 420,
};

/** Anchors whose href is /play and class list includes filled bg-signal. */
function filledSignalPlayCtas(html: string): string[] {
  const hits: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*>/gi)) {
    const tag = m[0];
    if (!tag.includes('href="/play"')) continue;
    if (/\bbg-signal\b/.test(tag)) hits.push(tag);
  }
  return hits;
}

function playAnchors(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => tag.includes('href="/play"'));
}

describe("FreeStackShell climb chrome (AC-3)", () => {
  it("sets data-climb-chrome and at least two atmosphere classes", () => {
    const html = renderToStaticMarkup(
      createElement(FreeStackShell, {
        section: "play",
        title: "Play",
        children: createElement("div", null, "canvas"),
      })
    );
    expect(html).toContain('data-climb-chrome');
    const atmosphere = [/\bgrain\b/, /\btopo\b/, /\bsurvey-grid\b/, /\bground-gradient\b/, /\baltimeter\b/];
    const present = atmosphere.filter((re) => re.test(html)).length;
    expect(present).toBeGreaterThanOrEqual(2);
    expect(html).toMatch(/\bgrain\b/);
    expect(html).toMatch(/\btopo\b/);
  });

  it("wires climb-reveal enter fork and climbGroundRise atmosphere (AC-17)", () => {
    const html = renderToStaticMarkup(
      createElement(FreeStackShell, {
        section: "leaderboard",
        title: "Climb",
        children: createElement("div", null, "lb"),
      })
    );
    expect(html).toMatch(/\bclimb-reveal\b/);
    expect(html).toMatch(/\banimate-climbGroundRise\b/);
    expect(html).toMatch(/\bground-gradient\b/);
    // Paid GroundRow baseline must not leak into free shell.
    expect(html).not.toMatch(/\banimate-groundRise\b/);
  });

  it("does not put climb-reveal on the play stage (mobile fullscreen)", () => {
    // climb-reveal uses transform; a transformed ancestor becomes the containing
    // block for ClimbScene's `fixed inset-0` touch layout and breaks fullscreen.
    const html = renderToStaticMarkup(
      createElement(FreeStackShell, {
        section: "play",
        title: "Play",
        children: createElement("div", { id: "stage" }, "canvas"),
      })
    );
    const stageIdx = html.indexOf('id="stage"');
    expect(stageIdx).toBeGreaterThan(0);
    const before = html.slice(0, stageIdx);
    const lastOpenDiv = before.lastIndexOf("<div");
    const wrapper = before.slice(lastOpenDiv, stageIdx);
    expect(wrapper).not.toMatch(/\bclimb-reveal\b/);
    // Tabs may still climb-reveal; chrome atmosphere stays.
    expect(html).toMatch(/\bgrain\b/);
    expect(html).toMatch(/\btopo\b/);
  });
});

describe("Hero free climb CTA (AC-5, AC-7)", () => {
  it("names climb, is ≥44×44, and is not the filled signal primary", () => {
    const html = renderToStaticMarkup(createElement(Hero, { stats: HERO_STATS }));
    const freePlay = playAnchors(html).find((tag) =>
      /aria-label="[^"]*climb/i.test(tag) || /Free climb/i.test(html)
    );
    expect(freePlay).toBeDefined();
    expect(freePlay!).toMatch(/aria-label="Play free climb"/i);
    expect(freePlay!).toMatch(/min-h-\[44px\]/);
    expect(freePlay!).toMatch(/min-w-\[44px\]/);
    expect(freePlay!).not.toMatch(/\bbg-signal\b/);
    expect(html).toContain("Free climb");
    expect(html).toContain('data-climb-chrome');
  });

  it("keeps zero filled bg-signal /play CTAs on the hero (AC-7 baseline)", () => {
    const html = renderToStaticMarkup(createElement(Hero, { stats: HERO_STATS }));
    expect(filledSignalPlayCtas(html)).toHaveLength(0);
  });

  it("applies climb-reveal + climbPunch on free band; paid pitch stays on shared reveal (AC-17)", () => {
    const html = renderToStaticMarkup(createElement(Hero, { stats: HERO_STATS }));
    expect(html).toMatch(/\bclimb-reveal\b/);
    expect(html).toMatch(/\banimate-climbPunch\b/);
    // Paid primary pitch still uses shared .reveal (not climb-reveal on h1).
    expect(html).toMatch(/class="reveal font-display/);
    // ElevationProfile paid ground keeps shared baseline.
    expect(html).toMatch(/\banimate-groundRise\b/);
  });
});

describe("Landing free climb CTA inventory (AC-7)", () => {
  it("Hero + Footer together still add 0 filled signal /play CTAs", () => {
    const hero = renderToStaticMarkup(createElement(Hero, { stats: HERO_STATS }));
    const footer = renderToStaticMarkup(createElement(Footer));
    expect(filledSignalPlayCtas(hero + footer)).toHaveLength(0);
  });
});

describe("FreeLeaderboard (AC-6)", () => {
  beforeEach(() => {
    vi.mocked(topFreeClimbers).mockReset();
  });

  it("heading uses display climb language when climbers exist", async () => {
    vi.mocked(topFreeClimbers).mockResolvedValue([
      {
        userId: "u1",
        handle: "apex",
        peakY: 900,
        rank: 1,
        wins: 2,
        username: "apex",
      },
    ]);
    const el = await FreeLeaderboard();
    const html = renderToStaticMarkup(el);
    expect(html).toContain('data-climb-chrome');
    expect(html).toContain(FREE_LEADERBOARD_HEADING_CLASS);
    expect(html).toMatch(/climber/i);
    expect(html).toContain("Top climbers");
    expect(html).toMatch(/\bclimb-reveal\b/);
    expect(html).toMatch(/\banimate-climbGroundRise\b/);
    const playLinks = playAnchors(html);
    expect(playLinks.length).toBeGreaterThanOrEqual(1);
    expect(filledSignalPlayCtas(html)).toHaveLength(0);
  });

  it("empty copy keeps climb language and a single /play text link", async () => {
    vi.mocked(topFreeClimbers).mockResolvedValue([]);
    const el = await FreeLeaderboard();
    const html = renderToStaticMarkup(el);
    expect(html).toMatch(/climber/i);
    expect(html).toMatch(/climb/i);
    const playLinks = playAnchors(html);
    // Intro + empty-state /play links are text underlines — not a second primary.
    expect(playLinks.length).toBeLessThanOrEqual(2);
    expect(filledSignalPlayCtas(html)).toHaveLength(0);
    expect(html).toContain("Play the free climb");
    expect(html).toMatch(/\bclimb-reveal\b/);
  });
});

describe("ClimbPanelIntro title (AC-8)", () => {
  it("uses the amplified display title class and mono signal eyebrow", () => {
    const html = renderToStaticMarkup(
      createElement(ClimbPanelIntro, { title: "Free climb leaderboard" })
    );
    expect(html).toContain(CLIMB_PANEL_INTRO_TITLE_CLASS);
    expect(html).toMatch(/font-mono[^"]*text-signal|text-signal[^"]*font-mono/);
    expect(html).toContain("Free stack · no payment");
    expect(html).toMatch(/\bclimb-reveal\b/);
  });
});

describe("FreeClimbCard rank + empty (AC-9, AC-11)", () => {
  it("rank numeral uses 2.8rem mono tabular with signal chrome", () => {
    const html = renderToStaticMarkup(
      createElement(FreeClimbCard, {
        climb: {
          peakY: 512,
          rank: 4,
          totalClimbers: 40,
          wins: 1,
          handle: "climber",
        },
      })
    );
    expect(html).toContain(FREE_CLIMB_RANK_CLASS);
    expect(html).toContain("shadow-signal");
    expect(html).toContain('data-climb-chrome');
    expect(html).toMatch(/\banimate-climbEnter\b/);
    expect(html).toMatch(/\banimate-climbGroundRise\b/);
  });

  it("FreeClimbEmpty body is not text-muted and play control is ≥44×44", () => {
    const html = renderToStaticMarkup(createElement(FreeClimbEmpty));
    expect(html).toContain('data-climb-chrome');
    // Body sentence must use secondary (or primary), not muted.
    expect(html).toContain("text-text-secondary");
    expect(html).toMatch(/No record yet[\s\S]*text-text-secondary|text-text-secondary[\s\S]*No record yet/);
    expect(html).toMatch(/\bclimb-reveal\b/);
    expect(html).toMatch(/\banimate-climbGroundRise\b/);
    const play = playAnchors(html)[0];
    expect(play).toBeDefined();
    expect(play!).toMatch(/min-h-\[44px\]/);
    expect(play!).toMatch(/min-w-\[44px\]/);
    expect(play!).not.toMatch(/\btext-muted\b/);
    // Eyebrow may use muted; body paragraph must not carry text-muted.
    const bodyMatch = html.match(
      /<p class="[^"]*\btext-text-secondary\b[^"]*text-sm mt-2[^"]*">([\s\S]*?)<\/p>/
    );
    expect(bodyMatch?.[1]).toMatch(/climb/i);
    expect(bodyMatch?.[0]).not.toContain("text-muted");
  });
});

describe("ClimbLeaderboard unavailable vs empty (AC-10)", () => {
  it("unavailable uses ember messaging, not empty climbers copy", () => {
    const html = renderToStaticMarkup(
      createElement(ClimbLeaderboard, { climbers: [], unavailable: true })
    );
    expect(html).toContain("standings unavailable");
    expect(html).toContain("text-ember");
    expect(html).not.toContain("no climbers yet");
  });

  it("empty list mentions climbers without ember unavailable copy", () => {
    const html = renderToStaticMarkup(
      createElement(ClimbLeaderboard, { climbers: [], unavailable: false })
    );
    expect(html).toContain("no climbers yet");
    expect(html).toMatch(/climb/i);
    expect(html).not.toContain("standings unavailable");
    expect(html).toContain("text-text-secondary");
  });
});
