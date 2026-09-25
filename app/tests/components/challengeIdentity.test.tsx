/**
 * Friend/challenge identity resolution (FriendRequests, UserSearch — web).
 *
 * Two behaviors that must hold, driven through real mounted components (not
 * reimplemented in the test):
 *
 *  1. A username-only user (no display_name) still shows their `@username`
 *     handle alongside the climberDisplay pseudonym — never just the
 *     pseudonym alone (the old `displayName && username` gate would have
 *     dropped the only identifying handle here).
 *  2. climberDisplay is the real, imported function — assertions compare
 *     against its actual return value for a given id, never a hardcoded
 *     pseudonym string and never "Someone" absence.
 *
 * @vitest-environment happy-dom
 */

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { climberHandle } from "../../src/lib/handle";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../src/contexts/AuthContext", () => ({
  useAuth: () => ({ token: "tok", user: { uid: "me" }, loading: false, isAnonymous: false, signOut: async () => {} }),
}));

import { FriendRequests } from "../../src/components/Challenge/FriendRequests";
import { UserSearch } from "../../src/components/Challenge/UserSearch";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function mount(el: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(el);
  });
  return {
    container,
    unmount() {
      act(() => root.unmount());
      document.body.removeChild(container);
    },
  };
}

/** The rendered @handle line, found by its text, never by its class. */
function handleLine(container: HTMLElement, username: string): HTMLElement | undefined {
  return Array.from(container.querySelectorAll<HTMLElement>("p")).find(
    (p) => p.textContent?.trim() === `@${username}`
  );
}

/** Web /duel keeps its text-xs handle under text-sm names; only mobile passes its own token. */
function expectWebHandleSize(line: HTMLElement | undefined) {
  expect(line).toBeTruthy();
  expect(line!.classList.contains("text-xs")).toBe(true);
  expect(line!.classList.contains("text-sm")).toBe(false);
  expect(line!.classList.contains("text-meta")).toBe(false);
}

describe("FriendRequests — username-only-no-displayname rendering", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the climberDisplay pseudonym as the name AND the @username sub-line for a user with a username but no display name", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        incoming: [
          {
            id: "req-1",
            sender: { id: "sender-1", displayName: null, username: "bobsmith" },
            createdAt: new Date().toISOString(),
          },
        ],
        outgoing: [],
      })
    );

    const { container, unmount } = mount(createElement(FriendRequests));

    // Flush the fetch + state updates fired from useEffect on mount.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const html = container.innerHTML;
    const expectedName = climberHandle("sender-1"); // no display name → pseudonym
    expect(html).toContain(expectedName);
    expect(html).toContain("@bobsmith");
    expectWebHandleSize(handleLine(container, "bobsmith"));

    unmount();
  });

  it("omits the sub-line when the user has no username at all", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        incoming: [
          {
            id: "req-2",
            sender: { id: "sender-2", displayName: null, username: null },
            createdAt: new Date().toISOString(),
          },
        ],
        outgoing: [],
      })
    );

    const { container, unmount } = mount(createElement(FriendRequests));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert on the sub-line element itself, not on the absence of "@" from the
    // whole subtree (which any future @-bearing class or mailto would break).
    const name = climberHandle("sender-2");
    const lines = Array.from(container.querySelectorAll("p")).map(
      (p) => p.textContent?.trim() ?? ""
    );
    expect(lines).toContain(name);
    expect(lines.filter((text) => text.startsWith("@"))).toEqual([]);

    unmount();
  });
});

describe("UserSearch — result preview renders name + @username + action button", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("fires search for a username-shaped query and renders name + handle + Add button", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        users: [{ id: "found-1", username: "creator-1", displayName: null }],
      })
    );

    const onSelect = vi.fn(async () => true);
    const { container, unmount } = mount(
      createElement(UserSearch, { onSelect })
    );

    const input = container.querySelector("input") as HTMLInputElement;
    expect(input).toBeTruthy();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!;
      setter.call(input, "creator-1");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Debounce is 300ms.
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/users/search?q=creator-1"),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer tok" }) })
    );

    const html = container.innerHTML;
    expect(html).toContain(climberHandle("found-1")); // no display name → pseudonym
    expect(html).toContain("@creator-1");
    expect(html).toContain("Add");
    expectWebHandleSize(handleLine(container, "creator-1"));
    // The typed query has replaced the placeholder; the field keeps its name.
    expect(input.value).toBe("creator-1");
    expect(input.getAttribute("aria-label")).toBe("Search by email or username");

    unmount();
  });
});
