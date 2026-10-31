/**
 * The footer's "Your move. Their lava." band is a sign-up pitch. It shows only
 * on pages that pitch the game; on sign-in, legal, status and game pages it
 * competed with the page's own action (Phase 5 re-grade).
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/" as string | null }));
const auth = vi.hoisted(() => ({ user: null as unknown, loading: false }));
vi.mock("../../src/contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import { SiteFooterAuth, showsFooterCta } from "../../src/components/SiteFooterAuth";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function footerText(pathname: string, user: unknown = null, loading = false): string {
  nav.pathname = pathname;
  auth.user = user;
  auth.loading = loading;
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(createElement(SiteFooterAuth)));
  const text = container.textContent ?? "";
  act(() => root.unmount());
  return text;
}

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

  it("renders the band for a signed-out visitor on a marketing page only", () => {
    expect(footerText("/")).toContain("Their lava");
    expect(footerText("/auth/signin")).not.toContain("Their lava");
    expect(footerText("/", { id: "u1" })).not.toContain("Their lava");
    expect(footerText("/", null, true)).not.toContain("Their lava");
    // The compact footer still renders its links there.
    expect(footerText("/auth/signin")).toContain("Terms");
  });
});
