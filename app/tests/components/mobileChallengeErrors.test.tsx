/**
 * The Challenge screen's load failure (mobile/src/screens/ChallengeScreen).
 *
 * Its three lists (challenges, friend requests, friends) load separately and,
 * with no connection, fail together. The screen shows that once, with one
 * Try again that reloads all three, rather than three red lines and three
 * RETRY buttons (Phase 4 grading, bar 9).
 *
 * @vitest-environment happy-dom
 */

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Friend requests refresh the shared app data after an accept; nothing is
// accepted here, so the provider is not needed.
vi.mock("../../mobile/src/contexts/AppDataContext", () => ({ useInvalidateAppData: () => () => {} }));

import { ChallengeScreen } from "../../mobile/src/screens/ChallengeScreen";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response;
}

/** Answers like the API: an empty account. */
function emptyAccount(input: RequestInfo | URL): Promise<Response> {
  const path = new URL(String(input)).pathname;
  if (path === "/api/challenge") return Promise.resolve(jsonResponse([]));
  if (path === "/api/friends/requests") return Promise.resolve(jsonResponse({ incoming: [], outgoing: [] }));
  if (path === "/api/friends") return Promise.resolve(jsonResponse({ friends: [] }));
  return Promise.resolve(jsonResponse({}, 404));
}

let root: Root;
let container: HTMLDivElement;

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function alerts(): string[] {
  return Array.from(container.querySelectorAll("[role=alert]")).map((a) => a.textContent?.trim() ?? "");
}

function buttons(name: string): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll("button")).filter((b) => b.textContent?.trim() === name);
}

describe("ChallengeScreen load failure", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("shows one error and one Try again when every list fails, and Try again reloads them all", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    act(() => {
      root = createRoot(container);
      root.render(createElement(MemoryRouter, null, createElement(ChallengeScreen)));
    });
    await flush();

    expect(alerts()).toEqual(["Couldn't load your friends and challenges. Check your connection and try again."]);
    expect(buttons("Try again")).toHaveLength(1);
    expect(buttons("Retry")).toHaveLength(0);
    expect(container.textContent).not.toMatch(/could not load|network error/i);

    fetchMock.mockReset();
    fetchMock.mockImplementation(emptyAccount);
    await act(async () => {
      buttons("Try again")[0].click();
    });
    await flush();

    const paths = fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname).sort();
    expect(paths).toEqual(["/api/challenge", "/api/friends", "/api/friends/requests"]);
    expect(alerts()).toEqual([]);
    expect(container.textContent).toContain("No friends yet");
  });

  it("keeps the error up while one list still fails", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) =>
      new URL(String(input)).pathname === "/api/friends" ? Promise.resolve(jsonResponse({}, 500)) : emptyAccount(input),
    );
    act(() => {
      root = createRoot(container);
      root.render(createElement(MemoryRouter, null, createElement(ChallengeScreen)));
    });
    await flush();

    expect(alerts()).toHaveLength(1);
    expect(container.textContent).not.toContain("No friends yet");
  });
});
