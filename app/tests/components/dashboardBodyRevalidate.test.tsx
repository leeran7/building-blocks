/**
 * DashboardBody — background revalidation after a server-populated first paint.
 *
 * Mounts the production component in a real DOM and drives its effects. The
 * defect this covers: when the server resolves `initialData`, Next.js's
 * back/forward navigation can restore that payload from the client router
 * cache long after it was produced, with no fresh server request. So the
 * client fetch must still run on every mount — while never downgrading
 * already-painted content to a skeleton, spinner, or error card.
 *
 * @vitest-environment happy-dom
 */

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Tell React 19 that we are in a test environment so act() works.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const useAuthMock = vi.fn();

vi.mock("../../src/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

const pushMock = vi.fn();
// One stable object, like the real useRouter() — the revalidation effect
// depends on the router, so a fresh object per render would refire it on every
// state change and the "exactly one fetch per mount" assertions below would be
// measuring the mock instead of the component.
const routerMock = { push: pushMock, replace: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

import { DashboardBody } from "../../app/dashboard/DashboardBody";
import type { DashboardData } from "../../src/db/dashboard";

/** What the server baked in before the user left the page. */
const STALE_DATA: DashboardData = {
  user: { id: "u1", email: "a@b.com", username: "climber1", betaJoined: false },
  freeClimb: null,
  replays: [],
  duelStats: { wins: 3, losses: 1, current_streak: 2, best_streak: 4 },
  recentDuels: [],
};

/** What the API returns now — the user won a duel while they were away. */
const FRESH_DATA: DashboardData = {
  ...STALE_DATA,
  duelStats: { wins: 4, losses: 1, current_streak: 3, best_streak: 4 },
};

const SKELETON = /bg-surface rounded-xl border border-border-subtle p-5 animate-pulse/;

function jsonOk(body: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(body) } as Response;
}

/**
 * Install a fetch stub that only the /api/dashboard call reaches. The mounted
 * tree also carries unrelated Navbar/wallet polls; those are left pending so
 * those components stay in their own loading state and cannot influence what
 * this file asserts. Returns the spy for the dashboard endpoint alone.
 */
function stubDashboardFetch(handler: () => Promise<Response>) {
  const dashboardCalls = vi.fn(handler);
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      url === "/api/dashboard" ? dashboardCalls() : new Promise<Response>(() => {})
    )
  );
  return dashboardCalls;
}

let container: HTMLDivElement;
let root: Root;

function mount(initialData: DashboardData | null) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(DashboardBody, { initialData }));
  });
}

/** Let pending promises (the fetch and its .json()) settle. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  useAuthMock.mockReturnValue({
    user: { uid: "u1" },
    token: "id-token",
    loading: false,
  });
  pushMock.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("DashboardBody background revalidation", () => {
  it("fetches /api/dashboard even though initialData was server-resolved, and replaces stale content with fresh", async () => {
    let resolveFetch: (r: Response) => void = () => {};
    const dashboardFetch = stubDashboardFetch(
      () => new Promise<Response>((resolve) => (resolveFetch = resolve))
    );

    mount(STALE_DATA);

    // The effect must not be suppressed by initialData being present.
    expect(dashboardFetch).toHaveBeenCalledTimes(1);

    // In flight: the seeded content stays on screen — no skeleton, no spinner.
    expect(container.innerHTML).toContain("3–1");
    expect(container.innerHTML).not.toMatch(SKELETON);
    expect(container.innerHTML).not.toMatch(/border-t-signal rounded-full animate-spin/);

    resolveFetch(jsonOk(FRESH_DATA));
    await flush();

    // Self-healed: the post-duel record replaced the restored stale one.
    expect(container.innerHTML).toContain("4–1");
    expect(container.innerHTML).not.toContain("3–1");
    expect(container.innerHTML).not.toMatch(SKELETON);
    // One revalidation per mount — the result landing must not re-arm the effect.
    expect(dashboardFetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the painted content when a background revalidation fails", async () => {
    stubDashboardFetch(() => Promise.reject(new Error("offline")));

    mount(STALE_DATA);
    await flush();

    expect(container.innerHTML).toContain("3–1");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.innerHTML).not.toContain("Network error");
  });

  it("still surfaces the error card when the fetch fails with no server data to fall back on", async () => {
    stubDashboardFetch(() => Promise.reject(new Error("offline")));

    mount(null);
    await flush();

    expect(container.innerHTML).toContain("Network error");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });
});
