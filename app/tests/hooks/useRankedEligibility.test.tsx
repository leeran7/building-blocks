/**
 * useRankedEligibility — monotonic revalidation.
 *
 * The server-resolved `serverAllowed` seed is correct from first paint (no
 * flash on mount). The `/api/geo/ranked` background probe exists only to
 * self-heal a stale client router cache entry (e.g. Next's back/forward
 * navigation, which bypasses `staleTimes` entirely — the same class of bug
 * fixed on `/dashboard`) or geo-signal variance between the page's own
 * render and the probe's request. It must be able to TIGHTEN the gate
 * (allowed -> blocked) but never LOOSEN it (blocked -> allowed): a blocked
 * user must never see a transient "allowed" flash, even if the probe
 * disagrees with the server for a moment.
 *
 * @vitest-environment happy-dom
 */

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { useRankedEligibility } from "../../src/hooks/useRankedEligibility";

function Probe({ enabled, serverAllowed }: { enabled: boolean; serverAllowed: boolean }) {
  const { allowed } = useRankedEligibility(enabled, serverAllowed);
  return createElement("span", { "data-allowed": String(allowed) });
}

function jsonOk(body: unknown): Response {
  return { ok: true, json: () => Promise.resolve(body) } as Response;
}

let container: HTMLDivElement;
let root: Root;

function mount(enabled: boolean, serverAllowed: boolean) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(Probe, { enabled, serverAllowed }));
  });
}

function allowedAttr(): string | null {
  return container.querySelector("span")?.getAttribute("data-allowed") ?? null;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("useRankedEligibility monotonic revalidation", () => {
  it("keeps a server-blocked seed blocked even when the probe (wrongly) reports allowed", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonOk({ allowed: true }))));

    mount(true, false);
    expect(allowedAttr()).toBe("false");

    await flush();

    // This is the load-bearing assertion: a disagreeing probe must never
    // loosen an already-correct "blocked" paint.
    expect(allowedAttr()).toBe("false");
  });

  it("tightens a server-allowed seed to blocked when the probe reports blocked", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonOk({ allowed: false }))));

    mount(true, true);
    expect(allowedAttr()).toBe("true");

    await flush();

    expect(allowedAttr()).toBe("false");
  });

  it("keeps the server seed on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));

    mount(true, true);
    await flush();

    expect(allowedAttr()).toBe("true");
  });

  it("never fetches when the probe is disabled", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(jsonOk({ allowed: true })));
    vi.stubGlobal("fetch", fetchSpy);

    mount(false, false);
    await flush();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(allowedAttr()).toBe("false");
  });
});
