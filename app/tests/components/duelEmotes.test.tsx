/**
 * DuelEmotes against a fake realtime handle: what a tap sends, what an
 * incoming emote shows, and the echo / mute / rate-limit guards.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DuelEmotes } from "../../src/components/Duel/DuelEmotes";
import type { RealtimeHandle } from "../../src/net/realtime";
import { emoteById, type Emote } from "../../src/net/emotes";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

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
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

function mount(rt: RealtimeHandle, extra: Record<string, unknown> = {}) {
  act(() => root.render(createElement(DuelEmotes, { realtime: rt, myId: "me", opponentName: "Bob", ...extra })));
}

const trigger = () => container.querySelector<HTMLButtonElement>(".emo-trigger")!;
const bubbles = () => [...container.querySelectorAll(".emo-bubble")].map((b) => ({ side: b.getAttribute("data-side"), text: b.querySelector(".emo-bubble-body")?.textContent }));
const button = (label: string) =>
  [...container.querySelectorAll<HTMLButtonElement>(".emo-tray button")].find(
    (b) => b.getAttribute("aria-label") === label || b.textContent === label
  )!;

describe("DuelEmotes", () => {
  it("tap opens the tray; picking an emote publishes its id and shows my bubble", () => {
    const rt = fakeRealtime();
    const onSend = vi.fn();
    mount(rt.handle, { onSend });
    expect(container.querySelector(".emo-tray")).toBeNull();
    act(() => trigger().click());
    expect(container.querySelector(".emo-tray")).not.toBeNull();
    act(() => button("GG").click());
    expect(rt.published).toEqual([{ id: "gg" }]);
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(bubbles()).toEqual([{ side: "me", text: "GG" }]);
    expect(container.querySelector(".emo-tray")).toBeNull();
  });

  it("shows the opponent's emote, and ignores the echo of my own", () => {
    const rt = fakeRealtime();
    const onReceive = vi.fn();
    mount(rt.handle, { onReceive });
    rt.deliver("fire", "me");
    expect(bubbles()).toEqual([]);
    rt.deliver("fire", "opp");
    expect(bubbles()).toEqual([{ side: "them", text: "🔥" }]);
    expect(container.querySelector(".emo-bubble[data-side=them] .emo-bubble-name")?.textContent).toBe("Bob");
    expect(onReceive).toHaveBeenCalledTimes(1);
  });

  it("bubbles clear after their animation", () => {
    const rt = fakeRealtime();
    mount(rt.handle);
    rt.deliver("wave", "opp");
    expect(bubbles()).toHaveLength(1);
    act(() => vi.advanceTimersByTime(2700));
    expect(bubbles()).toHaveLength(0);
  });

  it("muting hides the opponent's emotes and sticks across mounts", () => {
    const rt = fakeRealtime();
    mount(rt.handle);
    act(() => trigger().click());
    act(() => button("Mute Bob").click());
    rt.deliver("laugh", "opp");
    expect(bubbles()).toEqual([]);

    act(() => root.unmount());
    root = createRoot(container);
    const rt2 = fakeRealtime();
    mount(rt2.handle);
    rt2.deliver("laugh", "opp");
    expect(bubbles()).toEqual([]);
    act(() => trigger().click());
    act(() => button("Show Bob's emotes").click());
    act(() => vi.advanceTimersByTime(2000));
    rt2.deliver("laugh", "opp");
    expect(bubbles()).toEqual([{ side: "them", text: "😂" }]);
  });

  it("rate-limits my sends", () => {
    const rt = fakeRealtime();
    mount(rt.handle);
    act(() => trigger().click());
    act(() => button("Fire").click());
    act(() => trigger().click());
    act(() => button("Skull").click());
    expect(rt.published).toEqual([{ id: "fire" }]);
    expect(trigger().hasAttribute("data-cooling")).toBe(true);
    act(() => vi.advanceTimersByTime(1000));
    act(() => trigger().click());
    act(() => button("Skull").click());
    expect(rt.published).toEqual([{ id: "fire" }, { id: "skull" }]);
  });

  it("drops an incoming flood past the receive gate", () => {
    const rt = fakeRealtime();
    const onReceive = vi.fn();
    mount(rt.handle, { onReceive });
    for (let i = 0; i < 10; i++) rt.deliver("fire", "opp");
    expect(onReceive).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes on unmount", () => {
    const rt = fakeRealtime();
    mount(rt.handle);
    expect(rt.listeners.size).toBe(1);
    act(() => root.unmount());
    expect(rt.listeners.size).toBe(0);
    root = createRoot(container);
  });

  it("Escape closes the tray", () => {
    const rt = fakeRealtime();
    mount(rt.handle);
    act(() => trigger().click());
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(container.querySelector(".emo-tray")).toBeNull();
  });
});
