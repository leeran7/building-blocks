/**
 * /duel must not change height after it shows (the jitter between page
 * switches). Its signed-in reads used to mount loading rows that then
 * vanished or grew: "Loading requests…" and "Loading challenges…" rows that
 * collapsed to nothing, and a record strip that appeared from nowhere.
 *
 * Driven through the real mounted components with only fetch and auth faked:
 *  - friend requests and challenges render nothing during their first read,
 *    and a revisit paints the last list before the refresh answers;
 *  - the friends list keeps its rows through a refresh;
 *  - the record strip holds its shape with dashes, then fills in;
 *  - nothing cached for one account paints for another.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSessionCache,
  readSessionCache,
  writeSessionCache,
} from "../../src/lib/sessionCache";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

// One stable object per account: DuelHome's stats effect keys on `user`.
const ME = { uid: "me" };
const OTHER = { uid: "other" };
const AUTH = { user: ME as { uid: string }, token: "tok", loading: false, isAnonymous: false };
vi.mock("../../src/contexts/AuthContext", () => ({ useAuth: () => AUTH }));

import { FriendRequests } from "../../src/components/Challenge/FriendRequests";
import { PendingChallenges } from "../../src/components/Challenge/PendingChallenges";
import { FriendsList } from "../../src/components/Challenge/FriendsList";
import { DuelHome } from "../../src/components/Duel/DuelHome";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * fetch by path. A route set to `null` never answers (a read still in
 * flight); `answer(path, body)` settles the newest pending call to it.
 */
function fakeApi(routes: Record<string, unknown>) {
  const pending = new Map<string, (r: Response) => void>();
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      const path = new URL(input, "http://x").pathname;
      if (!(path in routes)) return Promise.resolve(json({}, 404));
      const body = routes[path];
      if (body === null) return new Promise<Response>((ok) => pending.set(path, ok));
      return Promise.resolve(json(body));
    })
  );
  return {
    answer(path: string, body: unknown, status = 200) {
      const ok = pending.get(path);
      if (!ok) throw new Error(`no pending call to ${path}`);
      pending.delete(path);
      ok(json(body, status));
    },
  };
}

function mount(el: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(el);
  });
  return {
    container,
    rerender(next: ReactElement) {
      act(() => root.render(next));
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

async function settle() {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
}

const REQUEST = {
  id: "req-1",
  sender: { id: "u-sender", displayName: "Sender Sam", username: "sam" },
  createdAt: "2026-10-30T00:00:00Z",
};
const CHALLENGE = {
  id: "ch-1",
  senderId: "u-rival",
  recipientId: "me",
  categorySlug: "tech",
  status: "pending",
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  createdAt: "2026-10-30T00:00:00Z",
  sender: { id: "u-rival", displayName: "Rival Ray", username: "ray" },
  recipient: { id: "me", displayName: "Me", username: "me" },
  direction: "received",
};
const FRIEND = { id: "f-1", user: { id: "u-pal", displayName: "Pal Pat", username: "pat" } };

beforeEach(() => {
  AUTH.user = ME;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("friend requests and challenges: no row that shows and then vanishes", () => {
  const cases = [
    {
      name: "FriendRequests",
      path: "/api/friends/requests",
      el: () => createElement(FriendRequests),
      body: { incoming: [REQUEST], outgoing: [] },
      text: "Accept",
    },
    {
      name: "PendingChallenges",
      path: "/api/challenge",
      el: () => createElement(PendingChallenges),
      body: [CHALLENGE],
      text: "challenged you",
    },
  ];

  for (const c of cases) {
    it(`${c.name} renders nothing while its first read is in flight`, async () => {
      const api = fakeApi({ [c.path]: null });
      const view = mount(c.el());
      expect(view.container.innerHTML).toBe("");

      // The same component does render once the read answers with rows.
      await act(async () => api.answer(c.path, c.body));
      await settle();
      expect(view.container.textContent).toContain(c.text);
      view.unmount();
    });

    it(`${c.name} paints the last list on a revisit, before the refresh answers`, async () => {
      const first = fakeApi({ [c.path]: null });
      const view = mount(c.el());
      await act(async () => first.answer(c.path, c.body));
      await settle();
      view.unmount();

      fakeApi({ [c.path]: null }); // the refresh never answers
      const again = mount(c.el());
      expect(again.container.textContent).toContain(c.text);
      again.unmount();
    });

    it(`${c.name} never paints another account's list`, async () => {
      const first = fakeApi({ [c.path]: null });
      const view = mount(c.el());
      await act(async () => first.answer(c.path, c.body));
      await settle();
      view.unmount();

      AUTH.user = OTHER;
      fakeApi({ [c.path]: null });
      const again = mount(c.el());
      expect(again.container.innerHTML).toBe("");
      again.unmount();
    });
  }

  it("a declined request is gone from the revisit too", async () => {
    const api = fakeApi({ "/api/friends/requests": null, "/api/friends/req-1/decline": { ok: true } });
    const view = mount(createElement(FriendRequests));
    await act(async () => api.answer("/api/friends/requests", { incoming: [REQUEST], outgoing: [] }));
    await settle();
    const decline = [...view.container.querySelectorAll("button")].find((b) => b.textContent === "Decline")!;
    await act(async () => decline.click());
    await settle();
    expect(view.container.textContent).not.toContain("Accept");
    view.unmount();

    fakeApi({ "/api/friends/requests": null });
    const again = mount(createElement(FriendRequests));
    expect(again.container.textContent).not.toContain("Accept");
    again.unmount();
  });
});

describe("friends list: keeps its rows", () => {
  const onChallenge = async () => true;

  it("paints the last list on a revisit, before the refresh answers", async () => {
    const first = fakeApi({ "/api/friends": null });
    const view = mount(createElement(FriendsList, { onChallenge }));
    expect(view.container.textContent).toContain("Loading friends");
    await act(async () => first.answer("/api/friends", { friends: [FRIEND] }));
    await settle();
    view.unmount();

    fakeApi({ "/api/friends": null });
    const again = mount(createElement(FriendsList, { onChallenge }));
    expect(again.container.textContent).toContain("Challenge");
    expect(again.container.textContent).not.toContain("Loading friends");
    again.unmount();
  });

  it("keeps the rows up while a refresh (refreshKey) is in flight", async () => {
    const api = fakeApi({ "/api/friends": null });
    const view = mount(createElement(FriendsList, { onChallenge, refreshKey: 0 }));
    await act(async () => api.answer("/api/friends", { friends: [FRIEND] }));
    await settle();

    view.rerender(createElement(FriendsList, { onChallenge, refreshKey: 1 }));
    await settle();
    expect(view.container.textContent).toContain("Challenge");
    expect(view.container.textContent).not.toContain("Loading friends");
    view.unmount();
  });

  it("never paints another account's friends", async () => {
    const first = fakeApi({ "/api/friends": null });
    const view = mount(createElement(FriendsList, { onChallenge }));
    await act(async () => first.answer("/api/friends", { friends: [FRIEND] }));
    await settle();
    view.unmount();

    AUTH.user = OTHER;
    fakeApi({ "/api/friends": null });
    const again = mount(createElement(FriendsList, { onChallenge }));
    expect(again.container.textContent).toContain("Loading friends");
    expect(again.container.textContent).not.toContain("Challenge");
    again.unmount();
  });
});

describe("DuelHome record strip: same shape before and after the record lands", () => {
  const QUIET = {
    "/api/friends/requests": { incoming: [], outgoing: [] },
    "/api/friends": { friends: [] },
    "/api/challenge": [],
    "/api/geo/ranked": { allowed: true },
  };
  const strip = (c: HTMLElement) =>
    [...c.querySelectorAll("p")].find((p) => p.textContent === "Your free 1v1 record")?.parentElement ?? null;
  const shape = (el: Element) => [...el.querySelectorAll("*")].map((e) => e.tagName).join(",");

  it("holds the strip with dashes while the read is in flight, then fills it in", async () => {
    const api = fakeApi({ ...QUIET, "/api/duel/stats": null });
    const view = mount(createElement(DuelHome, { initialGeoAllowed: true }));
    await settle();

    const pending = strip(view.container);
    expect(pending).not.toBeNull();
    expect(pending!.getAttribute("aria-busy")).toBe("true");
    expect(pending!.textContent).toContain("—");
    const before = shape(pending!);

    await act(async () => api.answer("/api/duel/stats", { wins: 12, losses: 5, current_streak: 0 }));
    await settle();
    const ready = strip(view.container)!;
    expect(ready.textContent).toContain("12");
    expect(ready.textContent).not.toContain("—");
    expect(ready.getAttribute("aria-busy")).toBeNull();
    expect(shape(ready)).toBe(before);
    view.unmount();
  });

  it("paints the last record on a revisit, before the refresh answers", async () => {
    const api = fakeApi({ ...QUIET, "/api/duel/stats": null });
    const view = mount(createElement(DuelHome, { initialGeoAllowed: true }));
    await act(async () => api.answer("/api/duel/stats", { wins: 7, losses: 2, current_streak: 3 }));
    await settle();
    view.unmount();

    fakeApi({ ...QUIET, "/api/duel/stats": null });
    const again = mount(createElement(DuelHome, { initialGeoAllowed: true }));
    const shown = strip(again.container)!;
    expect(shown.textContent).toContain("+3");
    expect(shown.getAttribute("aria-busy")).toBeNull();
    again.unmount();
  });

  it("drops the strip when the read fails and nothing was cached", async () => {
    const api = fakeApi({ ...QUIET, "/api/duel/stats": null });
    const view = mount(createElement(DuelHome, { initialGeoAllowed: true }));
    await act(async () => api.answer("/api/duel/stats", { error: "boom" }, 500));
    await settle();
    expect(strip(view.container)).toBeNull();
    view.unmount();
  });
});

describe("sessionCache scoping", () => {
  it("misses for any account but the one that wrote", () => {
    writeSessionCache("a", "k", 1);
    expect(readSessionCache("a", "k")).toBe(1);
    expect(readSessionCache("b", "k")).toBeUndefined();
    expect(readSessionCache(null, "k")).toBeUndefined();
  });

  it("drops the previous account's entries when another account writes", () => {
    writeSessionCache("a", "k", 1);
    writeSessionCache("b", "other", 2);
    expect(readSessionCache("a", "k")).toBeUndefined();
    expect(readSessionCache("b", "k")).toBeUndefined();
    expect(readSessionCache("b", "other")).toBe(2);
  });

  it("ignores a write with no account", () => {
    writeSessionCache(null, "k", 1);
    expect(readSessionCache(null, "k")).toBeUndefined();
    clearSessionCache();
  });
});
