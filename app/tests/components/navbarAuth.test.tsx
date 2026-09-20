/**
 * NavbarAuth — optimistic signed-in shape from cookie presence.
 *
 * The defect this covers: NavbarAuth showed a pulsing skeleton pill for the
 * entire window Firebase's async auth takes to resolve, even for a returning
 * user who almost certainly has a valid session (their `firebaseToken`
 * cookie is present). This mounts the production component and asserts the
 * skeleton is skipped in that case, while a genuinely signed-out visitor
 * (no cookie) still sees it — and that the cookie check never overrides the
 * real auth state once it resolves.
 *
 * @vitest-environment happy-dom
 */

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const useAuthMock = vi.fn();

vi.mock("../../src/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

// One stable object, like the real useRouter() — AccountMenu reads it.
const routerMock = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

import { NavbarAuth } from "../../src/components/NavbarAuth";

const SKELETON = /h-9 w-40 rounded-full bg-elevated animate-pulse/;

let container: HTMLDivElement;
let root: Root;

function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(NavbarAuth));
  });
}

beforeEach(() => {
  document.cookie = "firebaseToken=; Path=/; Max-Age=0";
  // AccountMenu/NotificationBell each fetch on mount; leave those pending so
  // they stay in their own null-token state and don't affect what this file
  // asserts, matching the established pattern for mounting Navbar children.
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.cookie = "firebaseToken=; Path=/; Max-Age=0";
  vi.unstubAllGlobals();
});

describe("NavbarAuth", () => {
  it("shows the skeleton while loading with no session cookie", () => {
    useAuthMock.mockReturnValue({ user: null, loading: true });

    mount();

    expect(container.innerHTML).toMatch(SKELETON);
  });

  it("skips the skeleton while loading when a session cookie is present", () => {
    document.cookie = "firebaseToken=some-token; Path=/";
    useAuthMock.mockReturnValue({ user: null, loading: true });

    mount();

    expect(container.innerHTML).not.toMatch(SKELETON);
    // The real account-menu trigger renders immediately, not a placeholder.
    expect(container.querySelector('[aria-label="Account menu"]')).not.toBeNull();
  });

  it("still shows sign-in links once loading resolves to signed-out, even if a stale cookie was present", () => {
    document.cookie = "firebaseToken=stale-token; Path=/";
    useAuthMock.mockReturnValue({ user: null, loading: false });

    mount();

    expect(container.innerHTML).not.toMatch(SKELETON);
    expect(container.querySelector('[aria-label="Account menu"]')).toBeNull();
    expect(container.innerHTML).toContain("Sign in");
  });

  it("shows the account menu once a real user resolves, cookie or not", () => {
    useAuthMock.mockReturnValue({
      user: { uid: "u1", displayName: "Climber" },
      token: "id-token",
      loading: false,
    });

    mount();

    expect(container.querySelector('[aria-label="Account menu"]')).not.toBeNull();
  });
});
