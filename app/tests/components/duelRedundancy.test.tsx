/**
 * Cross-app redundancy pass — duel-flow behavioral guards.
 *
 * Two changes this pass, both asserted against the real component's rendered
 * DOM (renderToStaticMarkup), never a source-text grep:
 *
 *  1. ChipDuelLobby now renders THROUGH DuelStackShell instead of hand-rolling
 *     its own navbar + tab band at max-w-2xl. That re-fixes the tab-band width
 *     jump on /duel/chips: the band must sit at the canonical DUEL_STACK_WIDTH
 *     (max-w-4xl) like /duel and /duel/leaderboard, with neither tab active.
 *  2. The /duel chips tier is a lean teaser: it links to /duel/chips (the
 *     canonical home for buy/claim) and no longer renders the "Buy chips" or
 *     "Claim daily chips" controls.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
const mockGet = vi.fn<(key: string) => string | null>(() => null);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => ({ get: mockGet }),
}));

let mockAuth = {
  user: null as unknown,
  token: null as string | null,
  isAnonymous: false,
};
vi.mock("../../src/contexts/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

// Paid duels ON so the chips tier is reachable on /duel.
vi.mock("../../src/config/paidDuel", () => ({
  PAID_DUELS_ENABLED: true,
  PAID_DUELS_ENABLED_PUBLIC: true,
}));

vi.mock("../../src/hooks/useRankedEligibility", () => ({
  useRankedEligibility: () => ({ allowed: true }),
}));

vi.mock("../../src/hooks/useWalletBalance", () => ({
  useWalletBalance: () => ({ playCents: 500, canClaimDailyChips: true, refresh: vi.fn() }),
}));

vi.mock("../../src/hooks/useClaimDailyChips", () => ({
  useClaimDailyChips: () => ({ state: { status: "idle" }, claim: vi.fn() }),
  dailyClaimVisibility: () => ({ showClaim: true, claimedToday: false }),
}));

import { ChipDuelLobby } from "../../src/components/Duel/ChipDuelLobby";
import { DuelHome } from "../../src/components/Duel/DuelHome";
import { DUEL_STACK_WIDTH } from "../../src/components/Duel/DuelStackShell";
import { CHIP_DUELS_HREF } from "../../src/components/navLinks";

/** The single tab-band container `<div>` that wraps the two NavTabs. */
function tabBandOuter(html: string): string {
  const anchor = 'aria-label="1v1 sections"';
  const idx = html.indexOf(anchor);
  expect(idx).toBeGreaterThan(0);
  // Walk back to the band's own width container (the div carrying mx-auto).
  const before = html.slice(0, idx);
  const bandStart = before.lastIndexOf(`${DUEL_STACK_WIDTH} mx-auto`);
  return html.slice(bandStart, idx);
}

describe("ChipDuelLobby renders through DuelStackShell (tab-band jitter fix)", () => {
  it("pins the 1v1 tab band to the canonical DUEL_STACK_WIDTH", () => {
    mockAuth = { user: null, token: null, isAnonymous: false };
    const html = renderToStaticMarkup(createElement(ChipDuelLobby));
    // The band container is the shared shell's, at max-w-4xl — not the old
    // hand-rolled max-w-2xl band that made the width jump.
    expect(tabBandOuter(html)).toContain(`${DUEL_STACK_WIDTH} mx-auto`);
    expect(html).not.toContain("max-w-2xl mx-auto w-full px-4 py-2");
  });

  it("shows both tabs with neither active (chips is a neutral section)", () => {
    mockAuth = { user: null, token: null, isAnonymous: false };
    const html = renderToStaticMarkup(createElement(ChipDuelLobby));
    expect(html).toContain("Leaderboard");
    expect(html).toContain(">Play<");
    // No active pill on /duel/chips: both NavTabs render inactive.
    expect(html).not.toContain('aria-selected="true"');
    expect(html).not.toContain('aria-current="page"');
  });

  it("preserves the chip-duel content and compliance line inside the shell", () => {
    mockAuth = { user: null, token: null, isAnonymous: false };
    const html = renderToStaticMarkup(createElement(ChipDuelLobby));
    expect(html).toContain("Chip Duels");
    expect(html).toContain("no cash value");
  });
});

describe("/duel chips tier is a lean teaser (no duplicate buy/claim)", () => {
  it("links to the canonical /duel/chips home and drops buy + claim controls", () => {
    mockAuth = { user: { uid: "u1" }, token: "tok", isAnonymous: false };
    mockGet.mockImplementation((key) => (key === "mode" ? "chips" : null));

    const html = renderToStaticMarkup(createElement(DuelHome));

    expect(html).toContain(`href="${CHIP_DUELS_HREF}"`);
    expect(html).toContain("Ranked chips");
    // Buy + claim belong only on /duel/chips now.
    expect(html).not.toContain("Buy chips");
    expect(html).not.toMatch(/Claim (your free daily|daily) chips/i);

    mockGet.mockImplementation(() => null);
  });
});
