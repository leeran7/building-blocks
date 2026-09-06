/**
 * Landing POP — Burial Horizon hero + composition ACs.
 *
 * Invokes production components (renderToStaticMarkup) rather than grepping
 * source. Locks AC-1/2/3/4/10/11/12/18-critical DOM hooks for verifier.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Hero } from "../../src/components/LandingPage/Hero";
import { HowItWorks } from "../../src/components/LandingPage/HowItWorks";
import { directoryIntroCopy } from "../../src/components/LandingPage/towerDirectoryPreview";

function renderHero(totalBlocks: number, minEntryUsd = 5) {
  return renderToStaticMarkup(
    createElement(Hero, { stats: { totalBlocks, minEntryUsd } })
  );
}

describe("Hero — Burial Horizon (AC-1, AC-2)", () => {
  it("owns a display-scale DOOMSTACK wordmark independent of Navbar", () => {
    const html = renderHero(0);
    expect(html).toContain('aria-label="Hero"');
    expect(html).toContain('data-testid="landing-hero"');
    expect(html).toContain('data-testid="landing-hero-brand"');
    expect(html).toContain("DOOMSTACK");
    expect(html).toContain("font-display");
    // Brand uses clamp display scale (AC-1 ≥40px at desktop via clamp max 6rem)
    expect(html).toMatch(/text-\[clamp\(2\.75rem/);
  });

  it("keeps the hero element budget: one h1, one pitch, one CTA group, one visual", () => {
    const html = renderHero(12);
    expect(html.match(/<h1\b/g)?.length).toBe(1);
    expect(html).toContain("CLIMB.");
    expect(html).toContain("BURIED.");
    expect(html).toContain('data-testid="landing-hero-cta"');
    expect(html).toContain('href="/auth/signup"');
    expect(html).toContain("Enter the arena");
    expect(html).toContain('href="/#towers"');
    expect(html).toContain("Browse stacks");
    expect(html).toContain('data-testid="landing-hero-visual"');
    expect(html).toContain('aria-hidden="true"');
  });
});

describe("Hero — declutter (AC-3, AC-10, AC-18)", () => {
  it("has no Paid/Free dual strips, free metrics, or play chip in the hero", () => {
    const html = renderHero(0);
    expect(html).not.toMatch(/>\s*Paid\s*</);
    expect(html).not.toMatch(/>\s*Free\s*</);
    expect(html).not.toContain("Blocks climbing");
    expect(html).not.toContain("Top climb");
    expect(html).not.toContain("Climbers");
    expect(html).not.toContain('href="/play"');
    expect(html).not.toContain("Already climbing?");
    expect(html).not.toContain("Season 01");
    expect(html).not.toContain("id=\"free\"");
    expect(html).not.toContain("id=\"towers\"");
  });

  it("does not present the visual as a rounded-2xl bordered surface card", () => {
    const html = renderHero(0);
    const visualIdx = html.indexOf('data-testid="landing-hero-visual"');
    expect(visualIdx).toBeGreaterThan(-1);
    // Full opening tag may put className before data-testid — walk back to <div
    const tagStart = html.lastIndexOf("<div", visualIdx);
    const tagEnd = html.indexOf(">", visualIdx);
    const visualOpenTag = html.slice(tagStart, tagEnd + 1);
    // Edge-to-edge underlay — no max-w boxing (AC-4 ≥90%/100vw)
    expect(visualOpenTag).not.toContain("max-w-6xl");
    expect(visualOpenTag).toContain("w-full");
    expect(visualOpenTag).toMatch(/\binset-x-0\b|\binset-0\b/);
    // Outer plane chrome: rounded-none, never the forbidden card combo
    const visualChunk = html.slice(tagStart, tagStart + 1400);
    expect(visualChunk).not.toContain("rounded-2xl");
    expect(visualChunk).not.toMatch(/rounded-2xl[^"]*border[^"]*bg-surface/);
    expect(visualChunk).toContain("rounded-none");
    expect(visualChunk).not.toContain("bg-surface");
  });
});

describe("Hero — empty arena (AC-11, AC-12)", () => {
  it("never leads with a live total of 0 as the dominant number", () => {
    const html = renderHero(0);
    expect(html).not.toContain(">0</");
    expect(html).not.toContain("0 blocks");
    expect(html).not.toContain("blocks live");
    // Invitation / pricing floor instead
    expect(html).toContain("from $5");
    expect(html).toContain("Paid stack · demo");
    // Demo altitudes still populate the visual (illustrative)
    expect(html).toContain("linear.app");
    expect(html).toContain("418.2");
  });

  it("uses arena chrome when live blocks exist, still without Free/Paid strips", () => {
    const html = renderHero(42);
    expect(html).toContain("Paid stack · arena");
    expect(html).not.toMatch(/\b42\b/);
    expect(html).not.toContain("42 blocks");
    expect(html).not.toMatch(/>\s*Paid\s*</);
  });
});

describe("Hero — motion class hooks (AC-14, AC-15)", () => {
  it("ships M1 reveal, M2 groundRise, and M3 climb stagger hooks", () => {
    const html = renderHero(0);
    expect(html).toContain("reveal");
    expect(html).toContain("ground-gradient");
    expect(html).toContain("animate-groundRise");
    expect(html).toContain("animate-climb");
  });
});

describe("HowItWorks — three stations (AC-9)", () => {
  it("renders exactly three ordered steps", () => {
    const html = renderToStaticMarkup(
      createElement(HowItWorks, { minEntryUsd: 5, minSpendUsd: 2 })
    );
    expect(html).toContain('id="how-it-works"');
    expect(html.match(/<li\b/g)?.length).toBe(3);
    expect(html).toContain("Station 01");
    expect(html).toContain("Station 02");
    expect(html).toContain("Station 03");
  });
});

describe("directoryIntroCopy — empty-safe (AC-12 spirit)", () => {
  it("avoids a numeric 0 blocks claim when cold", () => {
    const copy = directoryIntroCopy(74, 0);
    expect(copy).not.toMatch(/\b0 blocks\b/);
    expect(copy).toContain("claim #1");
    expect(copy).toContain("74 stacks");
  });

  it("reports live block totals when warm", () => {
    const copy = directoryIntroCopy(74, 12);
    expect(copy).toContain("12 blocks climbing");
  });
});
