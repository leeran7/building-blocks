/**
 * useEquipAvatar (mobile/src/contexts/AppDataContext): the one way a screen
 * equips a character outside Choose Character (the unlock reveal after a level,
 * the Shop's skin details). It PUTs to /api/settings, keeps only a body that
 * echoes the id back, and updates the cached settings the climber is drawn
 * from. useSwitchAwayWarning warns when the saved character is grandfathered.
 *
 * Real AppDataProvider; only the network, auth and haptics are mocked.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../mobile/src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "me" }, isAnonymous: false, loading: false, signOut: vi.fn(async () => {}) }),
}));

const net = vi.hoisted(() => ({
  avatarId: "stick-green" as string | null,
  grandfatheredId: null as string | null,
  put: "ok" as "ok" | "locked" | "no-echo" | "offline",
}));

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response;
}

const settingsBody = () => ({
  displayName: null,
  username: null,
  social: null,
  leaderboardConsent: true,
  avatarId: net.avatarId,
  avatarUnlocks: { stars: 40, unlockedIds: ["otter"], grandfatheredId: net.grandfatheredId, tutorialDone: true },
});

const apiFetch = vi.fn(async (path: string, init?: RequestInit): Promise<Response> => {
  if (path === "/api/settings" && init?.method === "PUT") {
    if (net.put === "offline") throw new TypeError("Failed to fetch");
    if (net.put === "locked") return jsonResponse({ error: "That character is locked." }, 403);
    if (net.put === "no-echo") return jsonResponse({ ok: true });
    net.avatarId = (JSON.parse(String(init.body)) as { avatarId: string }).avatarId;
    net.grandfatheredId = null;
  }
  if (path === "/api/settings") return jsonResponse(settingsBody());
  return jsonResponse({}, 404);
});

vi.mock("../../mobile/src/lib/api", () => ({
  API_BASE: "https://example.test",
  isNative: false,
  apiFetch: (path: string, init?: RequestInit) => apiFetch(path, init),
}));

import {
  AppDataProvider,
  useEquipAvatar,
  useEquippedAvatar,
  useSwitchAwayWarning,
  type EquipResult,
} from "../../mobile/src/contexts/AppDataContext";

const probe: { equip: ((id: string) => Promise<EquipResult>) | null | undefined } = { equip: undefined };

function Probe() {
  const equip = useEquipAvatar();
  useEffect(() => {
    probe.equip = equip;
  });
  const saved = useEquippedAvatar();
  const warning = useSwitchAwayWarning();
  return createElement(
    "div",
    null,
    createElement("output", { "data-testid": "saved" }, saved.loading ? "loading" : String(saved.avatarId)),
    createElement("output", { "data-testid": "warning" }, warning ?? ""),
  );
}

let root: Root | null = null;
const text = (id: string) => document.querySelector(`[data-testid="${id}"]`)?.textContent;
const puts = () => apiFetch.mock.calls.filter(([p, i]) => p === "/api/settings" && i?.method === "PUT");

async function mount(withProvider = true) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  await act(async () => {
    root = createRoot(el);
    root.render(withProvider ? createElement(AppDataProvider, null, createElement(Probe)) : createElement(Probe));
  });
  // Let the settings fetch settle.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  net.avatarId = "stick-green";
  net.grandfatheredId = null;
  net.put = "ok";
  apiFetch.mockClear();
  probe.equip = undefined;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("useEquipAvatar", () => {
  it("saves the character and the cached settings follow it", async () => {
    await mount();
    expect(text("saved")).toBe("stick-green");
    let res: EquipResult | undefined;
    await act(async () => {
      res = await probe.equip!("otter");
    });
    expect(res).toEqual({ ok: true });
    expect(puts().map(([, i]) => JSON.parse(String(i!.body)))).toEqual([{ avatarId: "otter" }]);
    expect(text("saved")).toBe("otter");
  });

  it("reports the server's refusal and keeps the saved character", async () => {
    await mount();
    net.put = "locked";
    let res: EquipResult | undefined;
    await act(async () => {
      res = await probe.equip!("otter");
    });
    expect(res).toEqual({ ok: false, error: "That character is locked." });
    expect(text("saved")).toBe("stick-green");
  });

  it("rejects a reply that does not echo the character back", async () => {
    await mount();
    net.put = "no-echo";
    let res: EquipResult | undefined;
    await act(async () => {
      res = await probe.equip!("otter");
    });
    expect(res?.ok).toBe(false);
    expect(text("saved")).toBe("stick-green");
  });

  it("turns a dropped connection into a line instead of throwing", async () => {
    await mount();
    net.put = "offline";
    let res: EquipResult | undefined;
    await act(async () => {
      res = await probe.equip!("otter");
    });
    expect(res).toEqual({ ok: false, error: "Couldn't equip it. Check your connection." });
  });

  it("is null without an AppDataProvider, where there is nothing to save", async () => {
    await mount(false);
    expect(probe.equip).toBeNull();
    expect(text("warning")).toBe("");
  });
});

describe("useSwitchAwayWarning", () => {
  it("warns only while the saved character is grandfathered", async () => {
    net.avatarId = "ibex";
    net.grandfatheredId = "ibex";
    await mount();
    expect(text("warning")).toMatch(/^Switching will lock Ibex until you earn \d+ stars\.$/);
    await act(async () => {
      await probe.equip!("otter");
    });
    expect(text("warning")).toBe("");
  });

  it("says nothing when the saved character is unlocked outright", async () => {
    net.avatarId = "ibex";
    await mount();
    expect(text("saved")).toBe("ibex");
    expect(text("warning")).toBe("");
  });
});
