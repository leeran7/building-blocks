/**
 * DuelHome smoke render.
 *
 * No prior test rendered DuelHome at all (see software-engineer handoff
 * 2026-09-20T14:52:00Z). /duel cannot be acceptance-checked by fetching the
 * route's server HTML: app/duel/page.tsx wraps DuelHome in <Suspense> and
 * DuelHome calls useSearchParams, so Next bails the whole route to
 * client-only rendering and a curl of "/duel" returns no page content —
 * that is pre-existing behaviour, not a regression to chase here. This test
 * instead renders the DuelHome *component* directly (via React, with
 * AuthContext and next/navigation mocked) so a future change that breaks
 * its React tree — the thing that actually determines what ships to the
 * client — is caught, without depending on Next's route-level SSR bailout.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
const mockGet = vi.fn(() => null);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => ({ get: mockGet }),
}));

let mockAuth = { user: null as unknown, token: null as string | null, isAnonymous: false };
vi.mock("../../src/contexts/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

import { DuelHome } from "../../src/components/Duel/DuelHome";

describe("DuelHome smoke render", () => {
  it("renders without throwing when signed out (sign-in gate path)", () => {
    mockAuth = { user: null, token: null, isAnonymous: false };
    const html = renderToStaticMarkup(createElement(DuelHome));
    expect(html).toContain("1v1 Arena");
    expect(html).toMatch(/sign in/i);
  });

  it("renders without throwing when signed in (action-cards path)", () => {
    mockAuth = { user: { uid: "u1" }, token: "tok", isAnonymous: false };
    const html = renderToStaticMarkup(createElement(DuelHome));
    expect(html).toContain("1v1 Arena");
    expect(html).toContain("Quick Match");
    expect(html).toContain("Challenge a friend");
    // No matchmaking bar mounted while idle (AC-8).
    expect(html).not.toContain("Matchmaking state");
  });

  it("renders without throwing for an anonymous Firebase session (treated as signed out)", () => {
    mockAuth = { user: { uid: "anon" }, token: "tok", isAnonymous: true };
    const html = renderToStaticMarkup(createElement(DuelHome));
    expect(html).toMatch(/sign in/i);
  });
});
