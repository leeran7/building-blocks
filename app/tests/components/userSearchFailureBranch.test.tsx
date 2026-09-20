/**
 * User search — non-ok response handling (web UserSearch + mobile
 * UserSearchSection).
 *
 * Regression this guards: before the fix in
 * software-engineer-2026-09-20T020500Z.json, neither search component had an
 * `else` branch for a non-ok response, so a 429 (or any failure) after an
 * earlier successful search left the PREVIOUS query's result row — and its
 * Add/Challenge button — rendered next to a now-different query. One click
 * would act on the wrong person. This was flagged as an untested gap in that
 * same handoff's learnings[3].
 *
 * Drives the real mounted components with a stubbed global fetch (never
 * reimplements the failure-branch logic here) and asserts against the real,
 * imported `searchFailureMessage` copy so this test can't silently drift from
 * production copy.
 *
 * @vitest-environment happy-dom
 */

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchFailureMessage } from "../../src/lib/userSearchQuery";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../src/contexts/AuthContext", () => ({
  useAuth: () => ({ token: "tok", user: { uid: "me" }, loading: false, isAnonymous: false, signOut: async () => {} }),
}));

import { UserSearch } from "../../src/components/Challenge/UserSearch";
import { UserSearchSection } from "../../mobile/src/components/challenge/UserSearchSection";

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

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("UserSearch (web) — 429 after a successful search clears the stale result row", () => {
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

  it("removes the previous result row (and its Add button) and shows the 429 copy", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ users: [{ id: "found-1", username: "creator-1", displayName: null }] })
    );

    const onSelect = vi.fn(async () => true);
    const { container, unmount } = mount(createElement(UserSearch, { onSelect }));
    const input = container.querySelector("input") as HTMLInputElement;

    await act(async () => {
      setInputValue(input, "creator-1");
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Sanity: the first (successful) query's row is present before the 429 —
    // the row is one clickable <button> whose action label ("Add") is its
    // last rendered child.
    expect(container.textContent).toContain("@creator-1");
    let buttonLabels = Array.from(container.querySelectorAll("button")).map(
      (b) => b.textContent?.trim() ?? ""
    );
    expect(buttonLabels.some((t) => t.endsWith("Add"))).toBe(true);

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Too many requests" }, 429));

    await act(async () => {
      setInputValue(input, "someone-2");
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    // The stale row for "creator-1" must be gone — not sitting next to a
    // different query with a clickable Add button.
    expect(container.textContent).not.toContain("@creator-1");
    buttonLabels = Array.from(container.querySelectorAll("button")).map(
      (b) => b.textContent?.trim() ?? ""
    );
    expect(buttonLabels.some((t) => t.endsWith("Add"))).toBe(false);
    expect(container.textContent).toContain(searchFailureMessage(429));

    unmount();
  });
});

describe("UserSearchSection (mobile) — 429 after a successful search clears the stale result row", () => {
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

  it("removes the previous result row (and its Add button) and shows the 429 copy", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ users: [{ id: "found-1", username: "creator-1", displayName: null }] })
    );

    const { container, unmount } = mount(createElement(UserSearchSection, {}));
    const input = container.querySelector("input") as HTMLInputElement;

    await act(async () => {
      setInputValue(input, "creator-1");
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("@creator-1");
    let buttonLabels = Array.from(container.querySelectorAll("button")).map(
      (b) => b.textContent?.trim() ?? ""
    );
    expect(buttonLabels).toContain("Add");

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Too many requests" }, 429));

    await act(async () => {
      setInputValue(input, "someone-2");
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain("@creator-1");
    buttonLabels = Array.from(container.querySelectorAll("button")).map(
      (b) => b.textContent?.trim() ?? ""
    );
    expect(buttonLabels).not.toContain("Add");
    expect(container.textContent).toContain(searchFailureMessage(429));

    unmount();
  });
});
