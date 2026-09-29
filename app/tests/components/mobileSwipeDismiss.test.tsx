/**
 * Swipe down to dismiss a bottom sheet (useSwipeDismiss): the release rule,
 * and the real level start sheet and leaderboard consent sheet driven with
 * pointer events. Haptics and the reduced-motion query are mocked; the slide
 * out and spring back run on fake timers (happy-dom fires no transitionend,
 * so the hook's fallback timer ends them).
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../mobile/src/lib/haptics", () => ({
  tapLight: vi.fn(async () => {}),
  tapMedium: vi.fn(async () => {}),
  tapHeavy: vi.fn(async () => {}),
  notifySuccess: vi.fn(async () => {}),
  notifyError: vi.fn(async () => {}),
}));
const motion = vi.hoisted(() => ({ reduce: false }));
vi.mock("../../mobile/src/lib/motion", () => ({ prefersReducedMotion: () => motion.reduce }));

import {
  SWIPE_BACK_MS,
  SWIPE_DISMISS_DISTANCE_PX,
  SWIPE_DISMISS_MIN_PX,
  SWIPE_FLICK_MIN_PX,
  SWIPE_FLICK_VELOCITY,
  SWIPE_OUT_MS,
  SWIPE_UPWARD_MAX_PX,
  dismissDistance,
  dragOffset,
  shouldDismiss,
} from "../../mobile/src/lib/useSwipeDismiss";
import { LevelStartSheet } from "../../mobile/src/components/levels/LevelStartSheet";
import { LeaderboardConsentModal } from "../../mobile/src/components/LeaderboardConsentModal";
import { season1Catalog } from "../../mobile/src/lib/levels/catalog";

describe("dismissDistance", () => {
  it("is 30% of the sheet, capped at the fixed distance and floored for short sheets", () => {
    expect(dismissDistance(300)).toBe(90);
    expect(dismissDistance(1000)).toBe(SWIPE_DISMISS_DISTANCE_PX);
    expect(dismissDistance(100)).toBe(SWIPE_DISMISS_MIN_PX);
  });

  it("falls back to the fixed distance when the height is unknown", () => {
    for (const h of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(dismissDistance(h)).toBe(SWIPE_DISMISS_DISTANCE_PX);
    }
  });
});

describe("shouldDismiss", () => {
  const TALL = 800;

  it("dismisses a slow drag at the distance threshold, not just before it", () => {
    expect(shouldDismiss({ dy: SWIPE_DISMISS_DISTANCE_PX, velocity: 0, height: TALL })).toBe(true);
    expect(shouldDismiss({ dy: SWIPE_DISMISS_DISTANCE_PX - 1, velocity: 0, height: TALL })).toBe(false);
  });

  it("uses 30% of a shorter sheet", () => {
    expect(shouldDismiss({ dy: 90, velocity: 0, height: 300 })).toBe(true);
    expect(shouldDismiss({ dy: 89, velocity: 0, height: 300 })).toBe(false);
  });

  it("dismisses a fast downward flick that moved far enough", () => {
    expect(shouldDismiss({ dy: SWIPE_FLICK_MIN_PX, velocity: SWIPE_FLICK_VELOCITY, height: TALL })).toBe(true);
    expect(shouldDismiss({ dy: 40, velocity: SWIPE_FLICK_VELOCITY - 0.01, height: TALL })).toBe(false);
    // A fast jitter that barely moved is a tap, not a flick.
    expect(shouldDismiss({ dy: SWIPE_FLICK_MIN_PX - 1, velocity: 3, height: TALL })).toBe(false);
  });

  it("never dismisses an upward drag, however fast or far", () => {
    for (const dy of [-1, -50, -500]) {
      for (const velocity of [0, 1, 5, -5]) {
        expect(shouldDismiss({ dy, velocity, height: TALL })).toBe(false);
      }
    }
    expect(shouldDismiss({ dy: 0, velocity: 5, height: TALL })).toBe(false);
  });

  it("keeps the sheet when the finger flicks back up after passing the threshold", () => {
    expect(shouldDismiss({ dy: 300, velocity: -SWIPE_FLICK_VELOCITY, height: TALL })).toBe(false);
    expect(shouldDismiss({ dy: 300, velocity: -SWIPE_FLICK_VELOCITY / 2, height: TALL })).toBe(true);
  });

  it("rejects non-finite input", () => {
    expect(shouldDismiss({ dy: Number.NaN, velocity: 0, height: TALL })).toBe(false);
    expect(shouldDismiss({ dy: Number.POSITIVE_INFINITY, velocity: 0, height: TALL })).toBe(false);
    expect(shouldDismiss({ dy: 300, velocity: Number.NaN, height: TALL })).toBe(false);
  });
});

describe("dragOffset", () => {
  it("follows the finger down 1:1", () => {
    expect(dragOffset(0)).toBe(0);
    expect(dragOffset(137)).toBe(137);
  });

  it("resists upward drags and never lifts past the cap", () => {
    expect(dragOffset(-10)).toBeLessThan(0);
    expect(dragOffset(-10)).toBeGreaterThan(-10);
    expect(dragOffset(-100)).toBeLessThan(dragOffset(-10));
    expect(dragOffset(-100_000)).toBeGreaterThan(-SWIPE_UPWARD_MAX_PX);
  });
});

// ---- The real sheets ------------------------------------------------------

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  motion.reduce = false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const catalog = season1Catalog();

function renderStartSheet(onClose: () => void) {
  act(() =>
    root.render(
      createElement(LevelStartSheet, {
        node: { ...catalog.level(20), stars: 0, bestMs: null },
        player: { lives: 5, maxLives: 5, nextLifeAt: null, xp: 0, playerLevel: 1, xpIntoLevel: 0, xpForNext: 100 },
        onStart: async () => ({ ok: false as const, code: "NETWORK" as const }),
        onPractice: () => {},
        onPracticeLevel: () => {},
        onClose,
      }),
    ),
  );
}

const sheet = () => {
  const el = container.querySelector<HTMLElement>('[role="dialog"]');
  if (!el) throw new Error("sheet not found");
  return el;
};
const handle = () => {
  const el = container.querySelector<HTMLElement>("[data-swipe-handle]");
  if (!el) throw new Error("handle not found");
  return el;
};
const scrim = () => {
  const el = container.querySelector<HTMLElement>(".ls-scrim");
  if (!el) throw new Error("scrim not found");
  return el;
};

function pointer(target: Element, type: string, clientY: number, clientX = 100) {
  act(() => {
    target.dispatchEvent(
      new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, isPrimary: true, pointerType: "touch", clientX, clientY }),
    );
  });
}

/** Press at y=100 on `from`, move down in 10px steps to 100 + `dy`, and (optionally) release. */
function drag(from: Element, dy: number, { release = true, stepMs = 0 } = {}) {
  pointer(from, "pointerdown", 100);
  const step = dy >= 0 ? 10 : -10;
  for (let moved = step; Math.abs(moved) <= Math.abs(dy); moved += step) {
    if (stepMs) vi.advanceTimersByTime(stepMs);
    // After capture the browser sends moves to the sheet; the target is the same bubbling path.
    pointer(from, "pointermove", 100 + moved);
  }
  if (release) pointer(from, "pointerup", 100 + dy);
}

const settle = (ms: number) => act(() => vi.advanceTimersByTime(ms + 100));

describe("level start sheet: swipe down to close", () => {
  it("renders the grab handle inside the drag zone", () => {
    renderStartSheet(() => {});
    expect(handle().querySelector("span[aria-hidden]")).not.toBeNull();
    expect(handle().querySelector("h2")?.textContent).toBe("Level 20");
  });

  it("follows the finger and fades the scrim while dragging", () => {
    renderStartSheet(() => {});
    vi.spyOn(sheet(), "getBoundingClientRect").mockReturnValue({ height: 600 } as DOMRect);
    drag(handle(), 150, { release: false });
    expect(sheet().style.transform).toBe("translateY(150px)");
    expect(Number(scrim().style.opacity)).toBeCloseTo(0.75, 5);
  });

  it("closes once, after sliding out, when released past the threshold", () => {
    const onClose = vi.fn();
    renderStartSheet(onClose);
    drag(handle(), SWIPE_DISMISS_DISTANCE_PX + 20);
    expect(sheet().style.transform).toBe("translateY(100%)");
    expect(onClose).not.toHaveBeenCalled();
    settle(SWIPE_OUT_MS);
    expect(onClose).toHaveBeenCalledTimes(1);
    // The other close paths do not close it a second time.
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    act(() => scrim().click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("uses 30% of a short sheet as the threshold", () => {
    const onClose = vi.fn();
    renderStartSheet(onClose);
    vi.spyOn(sheet(), "getBoundingClientRect").mockReturnValue({ height: 300 } as DOMRect);
    drag(handle(), 90);
    settle(SWIPE_OUT_MS);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("springs back and stays open after a short drag", () => {
    const onClose = vi.fn();
    renderStartSheet(onClose);
    drag(handle(), 60);
    expect(sheet().style.transform).toBe("translateY(0px)");
    settle(SWIPE_BACK_MS);
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet().style.transform).toBe("");
    expect(scrim().style.opacity).toBe("");
  });

  it("keeps dragging when the pressed child hands its implicit touch capture to the sheet", () => {
    // Chrome captures a touch pointer to the pressed element; setPointerCapture
    // on the sheet then fires lostpointercapture on that child, which bubbles.
    const onClose = vi.fn();
    renderStartSheet(onClose);
    pointer(handle(), "pointerdown", 100);
    pointer(handle(), "pointermove", 130);
    pointer(handle(), "lostpointercapture", 130);
    pointer(sheet(), "pointermove", 100 + SWIPE_DISMISS_DISTANCE_PX + 20);
    expect(sheet().style.transform).toBe(`translateY(${SWIPE_DISMISS_DISTANCE_PX + 20}px)`);
    pointer(sheet(), "pointerup", 100 + SWIPE_DISMISS_DISTANCE_PX + 20);
    settle(SWIPE_OUT_MS);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("springs back when the sheet itself loses capture mid-drag", () => {
    const onClose = vi.fn();
    renderStartSheet(onClose);
    drag(handle(), 300, { release: false });
    pointer(sheet(), "lostpointercapture", 400);
    settle(SWIPE_BACK_MS);
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet().style.transform).toBe("");
  });

  it("closes on a short fast flick", () => {
    const onClose = vi.fn();
    renderStartSheet(onClose);
    // 40px in 40ms: 1 px/ms.
    drag(handle(), 40, { stepMs: 10 });
    settle(SWIPE_OUT_MS);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on the same 40px dragged slowly", () => {
    const onClose = vi.fn();
    renderStartSheet(onClose);
    drag(handle(), 40, { stepMs: 200 });
    settle(SWIPE_BACK_MS);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("resists an upward drag on the handle and never closes", () => {
    const onClose = vi.fn();
    renderStartSheet(onClose);
    drag(handle(), -200, { release: false });
    const lifted = Number(/translateY\((-?[\d.]+)px\)/.exec(sheet().style.transform)?.[1]);
    expect(lifted).toBeLessThan(0);
    expect(lifted).toBeGreaterThan(-SWIPE_UPWARD_MAX_PX);
    pointer(handle(), "pointerup", -100);
    settle(SWIPE_OUT_MS);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("springs back on pointercancel, even past the threshold", () => {
    const onClose = vi.fn();
    renderStartSheet(onClose);
    drag(handle(), 300, { release: false });
    pointer(handle(), "pointercancel", 400);
    settle(Math.max(SWIPE_OUT_MS, SWIPE_BACK_MS));
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet().style.transform).toBe("");
  });

  it("closes from the body of the card when it is scrolled to the top", () => {
    const onClose = vi.fn();
    renderStartSheet(onClose);
    const stars = sheet().querySelector('ul[aria-label="Star times"]');
    if (!stars) throw new Error("star times not found");
    drag(stars, 200);
    settle(SWIPE_OUT_MS);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("leaves the body alone while the card is scrolled down", () => {
    const onClose = vi.fn();
    renderStartSheet(onClose);
    sheet().scrollTop = 40;
    expect(sheet().scrollTop).toBe(40);
    const stars = sheet().querySelector('ul[aria-label="Star times"]');
    if (!stars) throw new Error("star times not found");
    drag(stars, 200);
    settle(SWIPE_OUT_MS);
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet().style.transform).toBe("");
  });

  it("leaves the body alone while an inner list under the finger is scrolled down", () => {
    const onClose = vi.fn();
    renderStartSheet(onClose);
    const stars = sheet().querySelector('ul[aria-label="Star times"]');
    const row = stars?.querySelector("li");
    if (!stars || !row) throw new Error("star times not found");
    stars.scrollTop = 40;
    expect(stars.scrollTop).toBe(40);
    expect(sheet().scrollTop).toBe(0);
    drag(row, 200);
    settle(SWIPE_OUT_MS);
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet().style.transform).toBe("");
  });

  it("leaves an upward drag on the body to scrolling", () => {
    renderStartSheet(() => {});
    const stars = sheet().querySelector('ul[aria-label="Star times"]');
    if (!stars) throw new Error("star times not found");
    drag(stars, -200, { release: false });
    expect(sheet().style.transform).toBe("");
  });

  it("never drags from a button: Play, an accordion, or the ×", () => {
    const onClose = vi.fn();
    renderStartSheet(onClose);
    const buttons = [
      container.querySelector('button[aria-label="Play level 20"]'),
      container.querySelector("button[aria-expanded]"),
      handle().querySelector('button[aria-label="Close"]'),
    ];
    let checked = 0;
    for (const b of buttons) {
      if (!b) throw new Error("button not found");
      drag(b, 300, { release: false });
      expect(sheet().style.transform).toBe("");
      pointer(b, "pointerup", 400);
      checked += 1;
    }
    expect(checked).toBe(3);
    settle(SWIPE_OUT_MS);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("with reduced motion, closes at once on release and snaps back without a transition", () => {
    motion.reduce = true;
    const onClose = vi.fn();
    renderStartSheet(onClose);
    drag(handle(), 60);
    expect(sheet().style.transform).toBe("");
    expect(sheet().style.transition).toBe("");
    expect(onClose).not.toHaveBeenCalled();
    drag(handle(), 200);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("leaderboard consent sheet: swipe down is Not now", () => {
  function renderConsent(onDecline: () => void, busy = false) {
    act(() => root.render(createElement(LeaderboardConsentModal, { onAccept: () => {}, onDecline, busy })));
    const card = container.querySelector<HTMLElement>(".lcm-card");
    if (!card) throw new Error("consent card not found");
    return card;
  }

  it("declines once on a swipe past the threshold", () => {
    const onDecline = vi.fn();
    const card = renderConsent(onDecline);
    const title = card.querySelector("h2");
    if (!title) throw new Error("title not found");
    drag(title, 200);
    settle(SWIPE_OUT_MS);
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it("does not move while a save is in flight", () => {
    const onDecline = vi.fn();
    const card = renderConsent(onDecline, true);
    const grab = card.querySelector("[data-swipe-handle]");
    if (!grab) throw new Error("handle not found");
    drag(grab, 200);
    settle(SWIPE_OUT_MS);
    expect(onDecline).not.toHaveBeenCalled();
    expect(card.style.transform).toBe("");
  });
});
