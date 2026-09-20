/**
 * DashboardBody — server-populated first paint (skeleton-flash fix).
 *
 * Renders the production component via renderToStaticMarkup; no source-text
 * greps, no re-implemented logic. Asserts the actual defect being fixed:
 * when the server resolves `initialData`, real content paints on the very
 * first render even while useAuth() is still `loading` — not a spinner or
 * skeleton, and not nothing.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const useAuthMock = vi.fn();

vi.mock("../../src/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { DashboardBody, type DashboardData } from "../../app/dashboard/DashboardBody";

const FULL_DATA: DashboardData = {
  user: { id: "u1", email: "a@b.com", username: "climber1", betaJoined: false },
  freeClimb: null,
  replays: [],
  duelStats: { wins: 3, losses: 1, current_streak: 2, best_streak: 4 },
  recentDuels: [],
};

describe("DashboardBody server-populated first paint", () => {
  it("renders real duel-record content on first render even while auth is still loading (initialData present)", () => {
    // Mirrors the real mount sequence: the server resolved data server-side,
    // but the client's useAuth() hook has not resolved yet.
    useAuthMock.mockReturnValue({ user: null, token: null, loading: true });

    const html = renderToStaticMarkup(
      createElement(DashboardBody, { initialData: FULL_DATA })
    );

    expect(html).toContain('aria-label="1v1 duel record"');
    // The real win-loss numbers, not a pulsing placeholder.
    expect(html).toContain("3–1");
    // The dashboard's own SkeletonCard (distinct from Navbar's unrelated
    // auth-chip loading pulse) must not be present.
    expect(html).not.toMatch(
      /bg-surface rounded-xl border border-border-subtle p-5 animate-pulse/
    );
    // No full-page auth spinner either — this is the defect this change fixes.
    expect(html).not.toMatch(/border-t-signal rounded-full animate-spin/);
  });

  it("shows the loading skeleton, not content, when there is no initialData and auth is still resolving", () => {
    useAuthMock.mockReturnValue({ user: null, token: null, loading: true });

    const html = renderToStaticMarkup(
      createElement(DashboardBody, { initialData: null })
    );

    // Fallback path with initialData === null and authLoading === true shows
    // the auth spinner (before user/token are known), not real content.
    expect(html).toMatch(/animate-spin/);
    expect(html).not.toContain('aria-label="1v1 duel record"');
  });

  it("renders nothing once auth resolves to signed-out with no initialData", () => {
    useAuthMock.mockReturnValue({ user: null, token: null, loading: false });

    const html = renderToStaticMarkup(
      createElement(DashboardBody, { initialData: null })
    );

    expect(html).toBe("");
  });
});
