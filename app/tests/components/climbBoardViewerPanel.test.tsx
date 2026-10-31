/**
 * ClimbBoard viewer panel — fallback behaviour (AC-17).
 *
 * The panel reads the EXISTING GET /api/dashboard on mount when signed in.
 * On a non-200 response OR a rejected fetch it must degrade to the CTA-only
 * fallback, and the standings list must be byte-identical in both cases (no
 * new endpoint implied, table never depends on the viewer fetch).
 *
 * Rendered with react-dom/client + act (same pattern as
 * tests/hooks/useMatchmakingQueue.test.ts) so the real useEffect fetch runs —
 * renderToStaticMarkup would never execute it.
 *
 * @vitest-environment happy-dom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import type { ClimberRank } from "../../src/db/climb";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// Stable references: useAuth must return the same object identity across
// re-renders (as the real hook does once resolved) or ClimbBoard's
// useEffect([user, token, authLoading]) re-fires every render and loops.
const AUTH_STATE = { user: { uid: "u1" }, token: "tok", loading: false };
const FIRST_USER = AUTH_STATE.user;
vi.mock("../../src/contexts/AuthContext", () => ({
  useAuth: () => AUTH_STATE,
}));

import { ClimbBoard } from "../../src/components/Climb/ClimbBoard";

const CLIMBERS: ClimberRank[] = [
  { rank: 1, userId: "u1", handle: "apex", username: "apex", peakY: 900, wins: 2, avatarId: null },
  { rank: 2, userId: "u2", handle: "rival", username: null, peakY: 700, wins: 0, avatarId: null },
];

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(createElement(ClimbBoard, { climbers: CLIMBERS }));
  });
  return {
    container,
    async settle() {
      // Flush the pending fetch promise chain.
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      document.body.removeChild(container);
    },
  };
}

/**
 * What the panel shows: its text minus aria-hidden subtrees. A signed-in panel
 * keeps an invisible, aria-hidden copy of the record's layout (all dashes)
 * under a message, so it never changes height when the read lands.
 */
function visibleText(container: HTMLElement): string {
  const copy = container.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((el) => el.remove());
  return copy.textContent ?? "";
}

/** Every value in the hidden placeholder record is a dash: nothing leaked. */
function expectDashedPlaceholder(container: HTMLElement) {
  const hidden = container.querySelector('section[aria-label="Your best climb"] [aria-hidden="true"].invisible');
  expect(hidden).not.toBeNull();
  const values = [...hidden!.querySelectorAll("dd")].map((dd) => dd.textContent);
  expect(values).toEqual(["—", "—"]);
}

/** The rendered standings <ol> markup, independent of the viewer panel. */
function standingsHtml(container: HTMLElement): string {
  const ol = container.querySelector('ol[aria-label="Skill climb leaderboard"]');
  if (!ol) throw new Error("standings <ol> not found");
  return ol.outerHTML;
}

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  AUTH_STATE.user = FIRST_USER;
  vi.restoreAllMocks();
});

describe("ClimbBoard viewer panel — CTA-only fallback", () => {
  it("falls back to the CTA-only panel on a non-200 response, table unaffected", async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch;

    const view = mount();
    await view.settle();

    const html = view.container.innerHTML;
    expect(html).toContain("Your standing couldn’t be loaded right now.");
    // No peak-height / rank readout from a successful fetch leaked in.
    expect(visibleText(view.container)).not.toMatch(/Your rank/);
    expectDashedPlaceholder(view.container);
    const withNon200 = standingsHtml(view.container);

    view.unmount();

    // Same board, but the fetch rejects entirely this time.
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Network error");
    }) as unknown as typeof fetch;

    const view2 = mount();
    await view2.settle();

    const html2 = view2.container.innerHTML;
    expect(html2).toContain("Your standing couldn’t be loaded right now.");
    expect(visibleText(view2.container)).not.toMatch(/Your rank/);
    expectDashedPlaceholder(view2.container);
    const withRejection = standingsHtml(view2.container);

    view2.unmount();

    // The standings table itself never depends on the viewer fetch outcome.
    expect(withRejection).toBe(withNon200);
  });

  it("renders the populated panel (not the fallback) when the fetch succeeds", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          user: { id: "u1" },
          freeClimb: { peakY: 900, rank: 1, totalClimbers: 2 },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    ) as unknown as typeof fetch;

    const view = mount();
    await view.settle();

    const html = view.container.innerHTML;
    expect(visibleText(view.container)).toContain("Your rank");
    expect(visibleText(view.container)).toContain("#1");
    expect(html).not.toContain("Your standing couldn’t be loaded right now.");

    view.unmount();
  });
});

describe("ClimbBoard viewer panel — no height change when the standing lands", () => {
  function deferredFetch() {
    let answer: (r: Response) => void = () => {};
    globalThis.fetch = vi.fn(() => new Promise<Response>((ok) => { answer = ok; })) as unknown as typeof fetch;
    return (body: unknown) =>
      answer(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
  }
  const panel = (c: HTMLElement) => c.querySelector('section[aria-label="Your best climb"]')!;

  it("holds the record's layout with dashes while a signed-in read is in flight", async () => {
    AUTH_STATE.user = { uid: "fresh-1" };
    const respond = deferredFetch();
    const view = mount();

    const pending = panel(view.container);
    expect(pending.querySelector("[aria-busy=true]")).not.toBeNull();
    expect(pending.textContent).toContain("Your rank");
    expect(pending.textContent).toContain("—");
    const shape = [...pending.querySelectorAll("p, dl, dt, dd")].map((el) => el.tagName).join(",");

    await act(async () => respond({ user: { id: "fresh-1" }, freeClimb: { peakY: 640, rank: 7, totalClimbers: 40 } }));
    await view.settle();
    const ready = panel(view.container);
    expect(ready.textContent).toContain("#7");
    expect(ready.querySelector("[aria-busy=true]")).toBeNull();
    // Same elements in the same order: the numbers fill in, nothing is added.
    expect([...ready.querySelectorAll("p, dl, dt, dd")].map((el) => el.tagName).join(",")).toBe(shape);
    view.unmount();
  });

  it("paints the last standing at once when the board is opened again", async () => {
    AUTH_STATE.user = { uid: "fresh-2" };
    const first = deferredFetch();
    const view = mount();
    await act(async () => first({ user: { id: "fresh-2" }, freeClimb: { peakY: 512, rank: 3, totalClimbers: 9 } }));
    await view.settle();
    view.unmount();

    deferredFetch(); // the refresh never answers in this test
    const again = mount();
    const shown = panel(again.container);
    expect(shown.textContent).toContain("#3");
    expect(shown.querySelector("[aria-busy=true]")).toBeNull();
    again.unmount();
  });
});
