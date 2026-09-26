/**
 * The longest pseudonym on the mobile Challenge hub and the Ranks table.
 *
 * At 320px the incoming challenge and friend-request rows gave the name about
 * 12px beside Accept and Decline ("G."), so those rows now stack the actions
 * under the name. This file renders the real screens with the longest name the
 * generator can produce. It checks that every row carries the whole name and
 * that each stacked row's own Accept, Decline and Cancel still act on that row.
 *
 * happy-dom does no layout, so whether a name fits is measured in Chromium at
 * 320, 393 and 430 (scrollWidth against clientWidth on each name element), not
 * here.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANIMALS, climberHandle } from "@app/lib/handle";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

/** A 7-letter animal (the longest in ANIMALS) on a uid with the 8-letter adjective and a 2-digit number. */
const LONG_UID = "qa-53";
const LONG_AVATAR = "kestrel";
const LONGEST = climberHandle(LONG_UID, LONG_AVATAR);
const ME = "me";
const HOUR_MS = 3_600_000;

vi.mock("../../mobile/src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "me" }, isAnonymous: false, loading: false }),
}));
vi.mock("../../mobile/src/lib/haptics", () => ({
  tapLight: vi.fn(async () => {}),
  tapMedium: vi.fn(async () => {}),
  tapHeavy: vi.fn(async () => {}),
  notifySuccess: vi.fn(async () => {}),
  notifyError: vi.fn(async () => {}),
}));

const net = vi.hoisted(() => ({ climbers: [] as unknown[] }));

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response;
}

const longUser = { id: "qa-53", displayName: null, username: null, avatarId: "kestrel" };
const meUser = { id: "me", displayName: null, username: null, avatarId: null };

function challenge(id: string, direction: "sent" | "received") {
  return {
    id,
    senderId: direction === "received" ? longUser.id : meUser.id,
    recipientId: direction === "received" ? meUser.id : longUser.id,
    categorySlug: "tech",
    status: "pending",
    expiresAt: new Date(Date.now() + 2 * HOUR_MS).toISOString(),
    createdAt: new Date().toISOString(),
    sender: direction === "received" ? longUser : meUser,
    recipient: direction === "received" ? meUser : longUser,
    direction,
  };
}

const apiFetch = vi.fn(async (path: string, _init?: RequestInit): Promise<Response> => {
  if (path === "/api/challenge") return jsonResponse([challenge("c-in", "received"), challenge("c-out", "sent")]);
  if (path === "/api/friends/requests") {
    return jsonResponse({
      incoming: [{ id: "fr-in", sender: longUser, createdAt: "2026-09-01T00:00:00Z" }],
      outgoing: [{ id: "fr-out", receiver: longUser, createdAt: "2026-09-01T00:00:00Z" }],
    });
  }
  if (path === "/api/friends") return jsonResponse({ friends: [{ id: "f-1", user: longUser }] });
  if (path === "/api/challenge/c-in/accept") return jsonResponse({ duelId: "d-1" });
  if (/^\/api\/(challenge|friends)\/[^/]+(\/(decline|cancel|accept))?$/.test(path)) return jsonResponse({ ok: true });
  if (path === "/api/climb/leaderboard") return jsonResponse({ climbers: net.climbers });
  if (path === "/api/dashboard") return jsonResponse({ freeClimb: null });
  if (path === "/api/settings") return jsonResponse({ leaderboardConsent: true });
  return jsonResponse({}, 404);
});
vi.mock("../../mobile/src/lib/api", () => ({
  apiFetch: (path: string, init?: RequestInit) => apiFetch(path, init),
  API_BASE: "https://example.test",
}));

import { AppDataProvider } from "../../mobile/src/contexts/AppDataContext";
import { ChallengeScreen } from "../../mobile/src/screens/ChallengeScreen";
import { LeaderboardScreen } from "../../mobile/src/screens/LeaderboardScreen";

function LocationProbe() {
  return createElement("output", { "data-testid": "path" }, useLocation().pathname);
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  apiFetch.mockClear();
  net.climbers = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(path: string, element: ReactElement) {
  await act(async () => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        createElement(
          AppDataProvider,
          null,
          createElement(
            Routes,
            null,
            // Route paths never include the query string.
            createElement(Route, { path: path.split("?")[0], element }),
            createElement(Route, { path: "/duel/:id", element: createElement("p", null, "duel room") }),
          ),
          createElement(LocationProbe),
        ),
      ),
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
}

async function click(el: Element | null | undefined) {
  if (!el) throw new Error("element to click not found");
  await act(async () => {
    (el as HTMLElement).click();
  });
}

/** The Card under a section heading whose first line is `line`. */
function rowUnder(heading: string, line: string): HTMLElement {
  const section = [...container.querySelectorAll("h2")].find((h) => h.textContent === heading)?.parentElement;
  const p = [...(section?.querySelectorAll("p") ?? [])].find((el) => el.textContent?.trim() === line);
  const card = p?.closest("div.rounded-3xl");
  if (!card) throw new Error(`no row "${line}" under "${heading}"`);
  return card as HTMLElement;
}

const buttonsIn = (el: HTMLElement) => [...el.querySelectorAll("button")].map((b) => b.textContent?.trim());
const button = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
const posted = () => apiFetch.mock.calls.filter(([, init]) => init?.method).map(([p, init]) => `${init?.method} ${p}`);

describe("longest pseudonym fixture", () => {
  it("is the longest name the generator makes for the longest animal", () => {
    const longestAnimal = Math.max(...ANIMALS.map((a) => a.length));
    expect(LONG_AVATAR.length).toBe(longestAnimal);
    const sample = Array.from({ length: 2000 }, (_, i) => climberHandle(`qa-${i}`, LONG_AVATAR).length);
    expect(LONGEST.length).toBe(Math.max(...sample));
    expect(LONGEST.split(" ")[1]).toBe("Kestrel");
  });
});

describe("Challenge hub rows with the longest pseudonym", () => {
  it("shows the whole name on every row, with Accept then Decline under an incoming challenge", async () => {
    await render("/challenge", createElement(ChallengeScreen));

    const incoming = rowUnder("Incoming challenges", `${LONGEST} challenged you`);
    expect(buttonsIn(incoming)).toEqual(["Accept", "Decline"]);
    const request = rowUnder("Friend requests", LONGEST);
    expect(buttonsIn(request)).toEqual(["Accept", "Decline"]);
    expect(buttonsIn(rowUnder("Sent challenges", `Waiting for ${LONGEST}`))).toEqual(["Cancel"]);
    expect(buttonsIn(rowUnder("Sent requests", LONGEST))).toEqual(["Cancel"]);

    const friends = [...container.querySelectorAll("h2")].find((h) => h.textContent === "Friends")?.parentElement;
    expect([...(friends?.querySelectorAll("p") ?? [])].map((p) => p.textContent)).toContain(LONGEST);
  });

  it("declines only the challenge on its own row and removes that row", async () => {
    await render("/challenge", createElement(ChallengeScreen));
    await click(button(rowUnder("Incoming challenges", `${LONGEST} challenged you`), "Decline"));

    expect(posted()).toEqual(["POST /api/challenge/c-in/decline"]);
    expect(container.textContent).not.toContain(`${LONGEST} challenged you`);
    expect(container.textContent).toContain(`Waiting for ${LONGEST}`);
  });

  it("accepts the incoming challenge from its row and opens the duel", async () => {
    await render("/challenge", createElement(ChallengeScreen));
    await click(button(rowUnder("Incoming challenges", `${LONGEST} challenged you`), "Accept"));

    expect(posted()).toEqual(["POST /api/challenge/c-in/accept"]);
    expect(container.querySelector("[data-testid=path]")?.textContent).toBe("/duel/d-1");
  });

  it("accepts the friend request from its own stacked row", async () => {
    await render("/challenge", createElement(ChallengeScreen));
    await click(button(rowUnder("Friend requests", LONGEST), "Accept"));
    expect(posted()).toEqual(["POST /api/friends/fr-in/accept"]);
  });

  it("declines the friend request from its own stacked row", async () => {
    await render("/challenge", createElement(ChallengeScreen));
    await click(button(rowUnder("Friend requests", LONGEST), "Decline"));
    expect(posted()).toEqual(["POST /api/friends/fr-in/decline"]);
  });

  it("cancels the sent challenge from the row that names its recipient", async () => {
    await render("/challenge", createElement(ChallengeScreen));
    await click(button(rowUnder("Sent challenges", `Waiting for ${LONGEST}`), "Cancel"));

    expect(posted()).toEqual(["POST /api/challenge/c-out/cancel"]);
    expect(container.textContent).not.toContain(`Waiting for ${LONGEST}`);
  });
});

describe("Ranks table row with the longest pseudonym", () => {
  it("keeps the whole name and YOU in the name cell and the height in its own cell", async () => {
    net.climbers = [
      { rank: 1, userId: "a", handle: "Alpha One", username: null, peakY: 9000, wins: 0, avatarId: null },
      { rank: 2, userId: "b", handle: "Beta Two", username: null, peakY: 8000, wins: 0, avatarId: null },
      { rank: 3, userId: "c", handle: "Gamma Three", username: null, peakY: 7000, wins: 0, avatarId: null },
      { rank: 4, userId: ME, handle: LONGEST, username: null, peakY: 5000, wins: 0, avatarId: LONG_AVATAR },
    ];
    await render("/leaderboard?board=alltime", createElement(LeaderboardScreen));

    const row = container.querySelector("#lb-me");
    expect(row).toBeTruthy();
    const cells = [...(row?.children ?? [])].map((c) => c.textContent);
    expect(cells[0]).toBe("4");
    expect(cells).toContain(`${LONGEST}you`);
    expect(cells.at(-1)).toBe(`${(5000).toLocaleString()}ft`);
  });
});
