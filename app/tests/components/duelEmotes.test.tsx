/**
 * DuelEmotes against a fake realtime handle and a fake 3D stage: what a tap
 * sends, what an incoming emote shows (and which prop it asks the stage to
 * draw), the echo / mute / rate-limit guards, and the glyph fallback when
 * there is no WebGL.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RealtimeHandle } from "../../src/net/realtime";
import { EMOTE_MIN_GAP_MS, emoteById, type Emote } from "../../src/net/emotes";
import type { EmoteStage, EmoteViewSpec } from "../../src/components/Duel/emotes3d/emoteStage";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

/** The fake stage records every view asked of it. `available` false = no WebGL. */
const stageState = { available: true, views: [] as EmoteViewSpec[], disposed: 0 };
vi.mock("../../src/components/Duel/emotes3d/emoteStage", () => ({
  OUTRO_MS: 350,
  createEmoteStage: (): EmoteStage | null => {
    if (!stageState.available) return null;
    return {
      lost: false,
      add(spec) {
        stageState.views.push(spec);
        return {
          remove() {
            stageState.views = stageState.views.filter((v) => v !== spec);
          },
        };
      },
      dispose() {
        stageState.disposed += 1;
      },
    };
  },
}));
vi.mock("../../src/components/Duel/emoteAudio", () => ({
  unlockEmoteAudio: vi.fn(),
  playEmoteSting: vi.fn(),
}));

import { DuelEmotes } from "../../src/components/Duel/DuelEmotes";
import { playEmoteSting } from "../../src/components/Duel/emoteAudio";

function fakeRealtime() {
  const listeners = new Set<(e: Emote, clientId: string) => void>();
  const published: { id: string }[] = [];
  const handle = {
    publishEmote: (m: { id: string }) => published.push(m),
    onEmote: (cb: (e: Emote, clientId: string) => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  } as unknown as RealtimeHandle;
  const deliver = (id: string, clientId: string) => {
    const e = emoteById(id);
    if (!e) throw new Error(`fixture id ${id} not in catalog`);
    act(() => listeners.forEach((l) => l(e, clientId)));
  };
  return { handle, published, deliver, listeners };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers({ now: 100_000 });
  localStorage.clear();
  stageState.available = true;
  stageState.views = [];
  stageState.disposed = 0;
  vi.mocked(playEmoteSting).mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

async function mount(rt: RealtimeHandle, extra: Record<string, unknown> = {}) {
  await act(async () => {
    root.render(createElement(DuelEmotes, { realtime: rt, myId: "me", opponentName: "Bob", ...extra }));
  });
  // The stage module loads on demand; let the import settle.
  await act(async () => {
    await Promise.resolve();
  });
}

const trigger = () => container.querySelector<HTMLButtonElement>(".emo-trigger")!;
const bubbles = () =>
  [...container.querySelectorAll(".emo-bubble")].map((b) => ({
    side: b.getAttribute("data-side"),
    prop: b.querySelector("[data-emote-prop]")?.getAttribute("data-emote-prop"),
    text: b.querySelector(".emo-bubble-plate, .emo-bubble-caption")?.textContent,
  }));
const button = (label: string) =>
  [...container.querySelectorAll<HTMLButtonElement>(".emo-tray button")].find(
    (b) => b.getAttribute("aria-label") === label || b.textContent === label
  )!;

describe("DuelEmotes", () => {
  it("tap opens the tray with every prop drawn in 3D; picking a message publishes its id and shows my bubble", async () => {
    const rt = fakeRealtime();
    const onSend = vi.fn();
    await mount(rt.handle, { onSend, moment: "result" });
    expect(container.querySelector(".emo-tray")).toBeNull();
    act(() => trigger().click());
    expect(container.querySelector(".emo-tray")).not.toBeNull();
    // Nine prop tiles and a prop beside each quick message, all live views.
    expect(container.querySelectorAll(".emo-pick").length).toBe(9);
    expect(stageState.views.filter((v) => v.side === "tray").length).toBe(9 + container.querySelectorAll(".emo-line").length);
    // The result-screen lines come first on the result screen.
    const lines = [...container.querySelectorAll(".emo-line span")].map((s) => s.textContent);
    expect(lines.slice(0, 3)).toEqual(["GG", "Well played", "Rematch?"]);

    act(() => button("Good game").click());
    expect(rt.published).toEqual([{ id: "gg" }]);
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(bubbles()).toEqual([{ side: "me", prop: "thumbs", text: "GG" }]);
    expect(container.querySelector(".emo-tray")).toBeNull();
    // The bubble's prop is lit as mine and times out with the bubble.
    const bubbleView = stageState.views.find((v) => v.side === "me");
    expect(bubbleView?.prop).toBe("thumbs");
    expect(bubbleView?.durationMs).toBeGreaterThan(0);
    expect(playEmoteSting).toHaveBeenCalledWith("thumbs");
  });

  it("shows the opponent's emote lit as theirs, and ignores the echo of my own", async () => {
    const rt = fakeRealtime();
    const onReceive = vi.fn();
    await mount(rt.handle, { onReceive });
    rt.deliver("crown", "me");
    expect(bubbles()).toEqual([]);
    rt.deliver("crown", "opp");
    expect(bubbles()).toEqual([{ side: "them", prop: "crown", text: "On top" }]);
    expect(container.querySelector(".emo-bubble[data-side=them] .emo-bubble-name")?.textContent).toBe("Bob");
    expect(stageState.views.find((v) => v.side === "them")?.prop).toBe("crown");
    expect(onReceive).toHaveBeenCalledTimes(1);
    expect(playEmoteSting).toHaveBeenCalledWith("crown");
  });

  it("stays silent when the game is muted, but still shows the prop", async () => {
    const rt = fakeRealtime();
    await mount(rt.handle, { soundMuted: true });
    rt.deliver("skull", "opp");
    expect(bubbles()).toHaveLength(1);
    expect(playEmoteSting).not.toHaveBeenCalled();
  });

  it("bubbles clear after their animation and release their view", async () => {
    const rt = fakeRealtime();
    await mount(rt.handle);
    rt.deliver("rocket", "opp");
    expect(bubbles()).toHaveLength(1);
    expect(stageState.views.some((v) => v.side === "them")).toBe(true);
    act(() => vi.advanceTimersByTime(3300));
    expect(bubbles()).toHaveLength(0);
    expect(stageState.views.some((v) => v.side === "them")).toBe(false);
  });

  it("remembers the last prop I sent as a one-tap repeat", async () => {
    const rt = fakeRealtime();
    await mount(rt.handle);
    expect(container.querySelector(".emo-again")).toBeNull();
    act(() => trigger().click());
    act(() => button("On fire").click());
    const again = container.querySelector<HTMLButtonElement>(".emo-again")!;
    expect(again.getAttribute("aria-label")).toBe("Send On fire again");
    act(() => vi.advanceTimersByTime(EMOTE_MIN_GAP_MS));
    act(() => again.click());
    expect(rt.published).toEqual([{ id: "flame" }, { id: "flame" }]);
    // A quick message does not replace the shortcut.
    act(() => vi.advanceTimersByTime(EMOTE_MIN_GAP_MS));
    act(() => trigger().click());
    act(() => button("Good game").click());
    expect(container.querySelector(".emo-again")?.getAttribute("aria-label")).toBe("Send On fire again");
  });

  it("muting hides the opponent's emotes and sticks across mounts", async () => {
    const rt = fakeRealtime();
    await mount(rt.handle);
    act(() => trigger().click());
    act(() => button("Mute Bob").click());
    rt.deliver("skull", "opp");
    expect(bubbles()).toEqual([]);

    act(() => root.unmount());
    root = createRoot(container);
    const rt2 = fakeRealtime();
    await mount(rt2.handle);
    rt2.deliver("skull", "opp");
    expect(bubbles()).toEqual([]);
    act(() => trigger().click());
    act(() => button("Show Bob's emotes").click());
    act(() => vi.advanceTimersByTime(2000));
    rt2.deliver("skull", "opp");
    expect(bubbles()).toEqual([{ side: "them", prop: "skull", text: "Toast" }]);
  });

  it("rate-limits my sends and shows the cooldown on the button", async () => {
    const rt = fakeRealtime();
    await mount(rt.handle);
    act(() => trigger().click());
    act(() => button("On fire").click());
    expect(trigger().hasAttribute("data-cooling")).toBe(true);
    expect(trigger().querySelector(".emo-cool")).not.toBeNull();
    act(() => trigger().click());
    act(() => button("Toast").click());
    expect(rt.published).toEqual([{ id: "flame" }]);
    expect(trigger().hasAttribute("data-nope")).toBe(true);
    act(() => vi.advanceTimersByTime(EMOTE_MIN_GAP_MS));
    expect(trigger().hasAttribute("data-cooling")).toBe(false);
    act(() => trigger().click());
    act(() => button("Toast").click());
    expect(rt.published).toEqual([{ id: "flame" }, { id: "skull" }]);
  });

  it("drops an incoming flood past the receive gate", async () => {
    const rt = fakeRealtime();
    const onReceive = vi.fn();
    await mount(rt.handle, { onReceive });
    for (let i = 0; i < 10; i++) rt.deliver("flame", "opp");
    expect(onReceive).toHaveBeenCalledTimes(1);
  });

  it("falls back to glyphs when WebGL is unavailable", async () => {
    stageState.available = false;
    const rt = fakeRealtime();
    await mount(rt.handle);
    rt.deliver("crown", "opp");
    const view = container.querySelector(".emo-bubble [data-emote-prop]")!;
    expect(view.hasAttribute("data-fallback")).toBe(true);
    expect(view.textContent).toBe("👑");
    expect(stageState.views).toHaveLength(0);
  });

  it("unsubscribes and releases the stage on unmount", async () => {
    const rt = fakeRealtime();
    await mount(rt.handle);
    expect(rt.listeners.size).toBe(1);
    act(() => root.unmount());
    expect(rt.listeners.size).toBe(0);
    expect(stageState.disposed).toBe(1);
    root = createRoot(container);
  });

  it("Escape closes the tray", async () => {
    const rt = fakeRealtime();
    await mount(rt.handle);
    act(() => trigger().click());
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(container.querySelector(".emo-tray")).toBeNull();
  });
});
