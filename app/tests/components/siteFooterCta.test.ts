/**
 * The footer's "Your move. Their lava." band is a sign-up pitch. It shows only
 * on pages that pitch the game; on sign-in, legal, status and game pages it
 * competed with the page's own action (Phase 5 re-grade).
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/contexts/AuthContext", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { showsFooterCta } from "../../src/components/SiteFooterAuth";

describe("footer CTA band", () => {
  it("shows on the marketing pages", () => {
    for (const path of ["/", "/climb", "/duel", "/duel/leaderboard", "/rules"]) {
      expect(showsFooterCta(path)).toBe(true);
    }
  });

  it("stays off sign-in, legal, status, game and unknown pages", () => {
    for (const path of [
      "/auth/signin",
      "/auth/signup",
      "/terms",
      "/privacy",
      "/play",
      "/daily",
      "/duel/abc/watch",
      "/duel/abc",
      "/account/payout",
      "/no-such-page",
      "/climb/",
    ]) {
      expect(showsFooterCta(path)).toBe(false);
    }
    expect(showsFooterCta(null)).toBe(false);
  });
});
