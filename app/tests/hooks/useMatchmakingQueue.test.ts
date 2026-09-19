/**
 * useMatchmakingQueue hook tests.
 *
 * Covers: join flow (waiting -> polling -> matched), instant match, 409 resume,
 * 429 rate limit, timeout on expired, network error, cancel with DELETE,
 * interval cleanup on unmount, and reset from terminal states.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, useState, useRef, type MutableRefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// Tell React 19 that we are in a test environment so act() works.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// ── Module mocks ────────────────────────────────────────────────────────────

// Mock haptics before import so the hook picks up the mock.
vi.mock("../../mobile/src/lib/haptics", () => ({
  tapMedium: vi.fn(async () => {}),
  tapLight: vi.fn(async () => {}),
  notifySuccess: vi.fn(async () => {}),
  notifyError: vi.fn(async () => {}),
}));

// Mock apiFetch — we control every network response.
// Default implementation returns an empty 200 so cleanup DELETEs on unmount
// always return a thenable and never blow up.
const mockApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
mockApiFetch.mockImplementation(() => Promise.resolve(jsonResponse({})));
vi.mock("../../mobile/src/lib/api", () => ({
  apiFetch: (...args: Parameters<typeof mockApiFetch>) => mockApiFetch(...args),
}));

import {
  useMatchmakingQueue,
  type QueueState,
  type UseMatchmakingQueue,
} from "../../mobile/src/hooks/useMatchmakingQueue";
import { tapMedium, tapLight, notifySuccess, notifyError } from "../../mobile/src/lib/haptics";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal Response-like object. */
function jsonResponse(body: object, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(),
    redirected: false,
    statusText: "OK",
    type: "basic" as ResponseType,
    url: "",
    clone: () => jsonResponse(body, status),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(JSON.stringify(body)),
    bytes: () => Promise.resolve(new Uint8Array()),
  };
}

/**
 * Minimal renderHook for testing React hooks in jsdom.
 * Returns the current hook return value and helpers to unmount.
 */
function renderHook() {
  const container = document.createElement("div");
  document.body.appendChild(container);

  let hookResult: UseMatchmakingQueue | null = null;

  function TestComponent() {
    const result = useMatchmakingQueue();
    hookResult = result;
    return null;
  }

  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(createElement(TestComponent));
  });

  return {
    get current(): UseMatchmakingQueue {
      if (!hookResult) throw new Error("Hook not rendered");
      return hookResult;
    },
    unmount() {
      act(() => {
        root!.unmount();
      });
      document.body.removeChild(container);
    },
  };
}

// ── Setup / Teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  mockApiFetch.mockReset();
  // Re-establish default so cleanup DELETEs on unmount always get a thenable.
  mockApiFetch.mockImplementation(() => Promise.resolve(jsonResponse({})));
  vi.mocked(tapMedium).mockClear();
  vi.mocked(tapLight).mockClear();
  vi.mocked(notifySuccess).mockClear();
  vi.mocked(notifyError).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe("useMatchmakingQueue", () => {
  // ── Initial state ─────────────────────────────────────────────────────

  it("starts in idle with null duelId and errorMessage", () => {
    const hook = renderHook();
    expect(hook.current.state).toEqual({
      status: "idle",
      duelId: null,
      errorMessage: null,
    });
    hook.unmount();
  });

  // ── Join flow: waiting -> polling -> matched ──────────────────────────

  it("transitions through joining -> searching -> matched when polled", async () => {
    // POST returns waiting.
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ status: "waiting" }),
    );

    const hook = renderHook();

    // Join the queue.
    await act(async () => {
      hook.current.join();
    });

    // After POST resolves, should be searching.
    expect(hook.current.state.status).toBe("searching");

    // POST was called with correct path and body.
    expect(mockApiFetch).toHaveBeenCalledWith("/api/duel/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categorySlug: "tech" }),
    });

    // Set up the poll response: matched with a duelId.
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ status: "matched", duelId: "duel-123" }),
    );

    // Advance timers to trigger the poll interval (2000ms).
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    // Let the poll promise resolve.
    await act(async () => {
      await Promise.resolve();
    });

    expect(hook.current.state).toEqual({
      status: "matched",
      duelId: "duel-123",
      errorMessage: null,
    });
    expect(notifySuccess).toHaveBeenCalled();
    expect(tapMedium).toHaveBeenCalled();

    hook.unmount();
  });

  // ── Join instant match ────────────────────────────────────────────────

  it("goes directly to matched when POST returns matched with duelId", async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ status: "matched", duelId: "instant-456" }),
    );

    const hook = renderHook();

    await act(async () => {
      hook.current.join();
    });

    expect(hook.current.state).toEqual({
      status: "matched",
      duelId: "instant-456",
      errorMessage: null,
    });
    expect(notifySuccess).toHaveBeenCalled();

    hook.unmount();
  });

  // ── 409 resume ────────────────────────────────────────────────────────

  it("resumes polling when POST returns 409 (already in queue)", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({}, 409));

    const hook = renderHook();

    await act(async () => {
      hook.current.join();
    });

    expect(hook.current.state.status).toBe("searching");

    // Poll returns matched.
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ status: "matched", duelId: "resume-789" }),
    );

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(hook.current.state).toEqual({
      status: "matched",
      duelId: "resume-789",
      errorMessage: null,
    });

    hook.unmount();
  });

  // ── 429 rate limit ────────────────────────────────────────────────────

  it("sets error state with message on 429 rate limit", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({}, 429));

    const hook = renderHook();

    await act(async () => {
      hook.current.join();
    });

    expect(hook.current.state).toEqual({
      status: "error",
      duelId: null,
      errorMessage: "Too many searches -- give it a minute",
    });
    expect(notifyError).toHaveBeenCalled();

    hook.unmount();
  });

  // ── Non-ok response with error body ───────────────────────────────────

  it("displays server error message from response body", async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ error: "Queue is full" }, 503),
    );

    const hook = renderHook();

    await act(async () => {
      hook.current.join();
    });

    expect(hook.current.state).toEqual({
      status: "error",
      duelId: null,
      errorMessage: "Queue is full",
    });
    expect(notifyError).toHaveBeenCalled();

    hook.unmount();
  });

  // ── Non-ok response without error string falls back ───────────────────

  it("falls back to default error message when response has no error string", async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ code: "INTERNAL" }, 500),
    );

    const hook = renderHook();

    await act(async () => {
      hook.current.join();
    });

    expect(hook.current.state.status).toBe("error");
    expect(hook.current.state.errorMessage).toBe("Could not join queue");

    hook.unmount();
  });

  // ── Timeout: poll returns expired ─────────────────────────────────────

  it("transitions to timeout when poll returns expired", async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ status: "waiting" }),
    );

    const hook = renderHook();

    await act(async () => {
      hook.current.join();
    });

    expect(hook.current.state.status).toBe("searching");

    // Poll returns expired.
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ status: "expired" }),
    );

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(hook.current.state).toEqual({
      status: "timeout",
      duelId: null,
      errorMessage: null,
    });

    hook.unmount();
  });

  // ── Timeout: poll returns idle ────────────────────────────────────────

  it("transitions to timeout when poll returns idle (queue slot gone)", async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ status: "waiting" }),
    );

    const hook = renderHook();

    await act(async () => {
      hook.current.join();
    });

    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ status: "idle" }),
    );

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(hook.current.state).toEqual({
      status: "timeout",
      duelId: null,
      errorMessage: null,
    });

    hook.unmount();
  });

  // ── Timeout: POST returns expired directly ────────────────────────────

  it("transitions to timeout when POST response says expired", async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ status: "expired" }),
    );

    const hook = renderHook();

    await act(async () => {
      hook.current.join();
    });

    expect(hook.current.state).toEqual({
      status: "timeout",
      duelId: null,
      errorMessage: null,
    });

    hook.unmount();
  });

  // ── Network error on join ─────────────────────────────────────────────

  it("sets network error when POST throws", async () => {
    mockApiFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const hook = renderHook();

    await act(async () => {
      hook.current.join();
    });

    expect(hook.current.state).toEqual({
      status: "error",
      duelId: null,
      errorMessage: "Network error -- check your connection",
    });
    expect(notifyError).toHaveBeenCalled();

    hook.unmount();
  });

  // ── Cancel ────────────────────────────────────────────────────────────

  it("stops polling and sends DELETE on cancel", async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ status: "waiting" }),
    );

    const hook = renderHook();

    await act(async () => {
      hook.current.join();
    });

    expect(hook.current.state.status).toBe("searching");

    // Set up the DELETE response.
    mockApiFetch.mockResolvedValueOnce(jsonResponse({}));

    act(() => {
      hook.current.cancel();
    });

    expect(hook.current.state).toEqual({
      status: "idle",
      duelId: null,
      errorMessage: null,
    });
    expect(tapLight).toHaveBeenCalled();

    // The DELETE should have been called.
    expect(mockApiFetch).toHaveBeenCalledWith("/api/duel/queue", {
      method: "DELETE",
    });

    // Advance timers — no more polls should fire.
    mockApiFetch.mockClear();
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    // Only no new calls after cancel (no GET polls).
    expect(mockApiFetch).not.toHaveBeenCalled();

    hook.unmount();
  });

  // ── Cancel when not in queue does not send DELETE ─────────────────────

  it("does not send DELETE when cancelling from idle", () => {
    const hook = renderHook();

    act(() => {
      hook.current.cancel();
    });

    // No DELETE call — we were never in the queue.
    const deleteCalls = mockApiFetch.mock.calls.filter(
      ([, init]) => init?.method === "DELETE",
    );
    expect(deleteCalls).toHaveLength(0);

    hook.unmount();
  });

  // ── Unmount cleanup ───────────────────────────────────────────────────

  it("clears interval and sends DELETE on unmount while searching", async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ status: "waiting" }),
    );

    const hook = renderHook();

    await act(async () => {
      hook.current.join();
    });

    expect(hook.current.state.status).toBe("searching");

    // Set up DELETE response for unmount cleanup.
    mockApiFetch.mockResolvedValueOnce(jsonResponse({}));

    hook.unmount();

    // DELETE should have been called on unmount.
    const deleteCalls = mockApiFetch.mock.calls.filter(
      ([, init]) => init?.method === "DELETE",
    );
    expect(deleteCalls).toHaveLength(1);

    // Advance timers — no more polls should fire after unmount.
    mockApiFetch.mockClear();
    vi.advanceTimersByTime(4000);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  // ── Unmount when idle does not send DELETE ────────────────────────────

  it("does not send DELETE on unmount when idle", () => {
    const hook = renderHook();
    mockApiFetch.mockClear();

    hook.unmount();

    const deleteCalls = mockApiFetch.mock.calls.filter(
      ([, init]) => init?.method === "DELETE",
    );
    expect(deleteCalls).toHaveLength(0);
  });

  // ── Unmount after match does not send DELETE ──────────────────────────

  it("does not send DELETE on unmount after matching", async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ status: "matched", duelId: "m-1" }),
    );

    const hook = renderHook();

    await act(async () => {
      hook.current.join();
    });

    expect(hook.current.state.status).toBe("matched");
    mockApiFetch.mockClear();

    hook.unmount();

    const deleteCalls = mockApiFetch.mock.calls.filter(
      ([, init]) => init?.method === "DELETE",
    );
    expect(deleteCalls).toHaveLength(0);
  });

  // ── Reset ─────────────────────────────────────────────────────────────

  it("resets to idle from timeout", async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ status: "expired" }),
    );

    const hook = renderHook();

    await act(async () => {
      hook.current.join();
    });

    expect(hook.current.state.status).toBe("timeout");

    act(() => {
      hook.current.reset();
    });

    expect(hook.current.state).toEqual({
      status: "idle",
      duelId: null,
      errorMessage: null,
    });

    hook.unmount();
  });

  it("resets to idle from error", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("boom"));

    const hook = renderHook();

    await act(async () => {
      hook.current.join();
    });

    expect(hook.current.state.status).toBe("error");

    act(() => {
      hook.current.reset();
    });

    expect(hook.current.state).toEqual({
      status: "idle",
      duelId: null,
      errorMessage: null,
    });

    hook.unmount();
  });

  // ── Poll keeps polling on "waiting" ───────────────────────────────────

  it("continues polling while status is waiting", async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ status: "waiting" }),
    );

    const hook = renderHook();

    await act(async () => {
      hook.current.join();
    });

    // First poll: still waiting.
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ status: "waiting" }),
    );

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(hook.current.state.status).toBe("searching");

    // Second poll: matched.
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ status: "matched", duelId: "d-2" }),
    );

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(hook.current.state.status).toBe("matched");
    expect(hook.current.state.duelId).toBe("d-2");

    hook.unmount();
  });

  // ── Poll error is swallowed and retried ───────────────────────────────

  it("swallows poll errors and retries on next interval", async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ status: "waiting" }),
    );

    const hook = renderHook();

    await act(async () => {
      hook.current.join();
    });

    // First poll: network error.
    mockApiFetch.mockRejectedValueOnce(new Error("network"));

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Still searching — error was swallowed.
    expect(hook.current.state.status).toBe("searching");

    // Second poll: matched.
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ status: "matched", duelId: "retry-1" }),
    );

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(hook.current.state.status).toBe("matched");
    expect(hook.current.state.duelId).toBe("retry-1");

    hook.unmount();
  });

  // ── Poll non-ok response is ignored ───────────────────────────────────

  it("ignores non-ok poll responses and keeps polling", async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ status: "waiting" }),
    );

    const hook = renderHook();

    await act(async () => {
      hook.current.join();
    });

    // Poll returns 500.
    mockApiFetch.mockResolvedValueOnce(jsonResponse({}, 500));

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Still searching.
    expect(hook.current.state.status).toBe("searching");

    hook.unmount();
  });

  // ── Non-ok POST with JSON parse failure ───────────────────────────────

  it("handles non-ok POST response when JSON parsing fails", async () => {
    const badResponse: Response = {
      ...jsonResponse({}, 500),
      json: () => Promise.reject(new Error("invalid json")),
    };
    mockApiFetch.mockResolvedValueOnce(badResponse);

    const hook = renderHook();

    await act(async () => {
      hook.current.join();
    });

    expect(hook.current.state.status).toBe("error");
    expect(hook.current.state.errorMessage).toBe("Could not join queue");

    hook.unmount();
  });

  // ── Haptics: join triggers tapMedium ──────────────────────────────────

  it("fires tapMedium haptic on join", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ status: "waiting" }));

    const hook = renderHook();

    await act(async () => {
      hook.current.join();
    });

    expect(tapMedium).toHaveBeenCalledTimes(1);

    hook.unmount();
  });

  // ── Haptics: cancel triggers tapLight ─────────────────────────────────

  it("fires tapLight haptic on cancel", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ status: "waiting" }));

    const hook = renderHook();

    await act(async () => {
      hook.current.join();
    });

    mockApiFetch.mockResolvedValueOnce(jsonResponse({}));
    act(() => {
      hook.current.cancel();
    });

    expect(tapLight).toHaveBeenCalledTimes(1);

    hook.unmount();
  });

  // ── Matched response without duelId is not treated as matched ─────────

  it("does not transition to matched when poll has matched status but no duelId", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ status: "waiting" }));

    const hook = renderHook();

    await act(async () => {
      hook.current.join();
    });

    // Poll returns matched without duelId — boundary case.
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ status: "matched" }),
    );

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Should NOT be matched — still searching since duelId is missing.
    expect(hook.current.state.status).toBe("searching");

    hook.unmount();
  });

  // ── POST matched without duelId is not treated as instant match ───────

  it("does not transition to matched when POST has matched status but no duelId", async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ status: "matched" }),
    );

    const hook = renderHook();

    await act(async () => {
      hook.current.join();
    });

    // Falls through to the "waiting" branch — starts polling.
    expect(hook.current.state.status).toBe("searching");

    hook.unmount();
  });
});
