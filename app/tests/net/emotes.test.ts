/**
 * Duel emotes travel as catalog ids; the receiver rejects anything else and
 * both ends rate-limit. Every catalog prop has a 3D model.
 */

import { describe, expect, it } from "vitest";
import {
  createEmoteGate,
  EMOTE_BURST,
  EMOTE_MIN_GAP_MS,
  EMOTE_PROPS,
  EMOTE_WINDOW_MS,
  EMOTES,
  emoteById,
  parseEmoteMessage,
  QUICK_MESSAGES,
  quickMessagesFor,
} from "../../src/net/emotes";
import { MODELLED_PROPS } from "../../src/components/Duel/emotes3d/emoteModels";

describe("emote catalog", () => {
  it("ids are unique and every entry parses back to itself", () => {
    expect(new Set(EMOTES.map((e) => e.id)).size).toBe(EMOTES.length);
    for (const e of EMOTES) expect(parseEmoteMessage({ id: e.id })).toBe(e);
  });

  it("has a 3×3 wheel of props and quick messages for every moment of a duel", () => {
    expect(EMOTE_PROPS).toHaveLength(9);
    expect(new Set(EMOTE_PROPS.map((e) => e.prop)).size).toBe(9);
    for (const e of EMOTE_PROPS) expect(e.text).toBe("");
    for (const e of QUICK_MESSAGES) {
      expect(e.text.length).toBeGreaterThan(0);
      expect(e.moment).toBeDefined();
    }
    for (const moment of ["lobby", "climb", "result"] as const) {
      expect(QUICK_MESSAGES.filter((e) => e.moment === moment).length).toBeGreaterThan(0);
    }
  });

  it("every prop the catalog names has a model, and every model is used", () => {
    const used = new Set(EMOTES.map((e) => e.prop));
    expect([...used].sort()).toEqual([...MODELLED_PROPS].sort());
  });

  it("lists the lines for the current moment first, keeping all of them", () => {
    const climb = quickMessagesFor("climb");
    expect(climb).toHaveLength(QUICK_MESSAGES.length);
    const firstOther = climb.findIndex((e) => e.moment !== "climb");
    expect(climb.slice(0, firstOther).every((e) => e.moment === "climb")).toBe(true);
    expect(climb.slice(firstOther).every((e) => e.moment !== "climb")).toBe(true);
    expect(quickMessagesFor("result")[0].text).toBe("GG");
    expect(quickMessagesFor("lobby")[0].text).toBe("Good luck!");
  });

  it("rejects unknown ids, prototype keys and non-strings, never substituting one", () => {
    expect(parseEmoteMessage({ id: "gg" })?.text).toBe("GG");
    for (const bad of ["nope", "GG", "fire", "__proto__", "toString", "constructor", "hasOwnProperty", "", 7, null, undefined, { id: "gg" }]) {
      expect(emoteById(bad)).toBeNull();
      expect(parseEmoteMessage({ id: bad })).toBeNull();
    }
    for (const bad of [null, undefined, "gg", 3, [], ["gg"]]) expect(parseEmoteMessage(bad)).toBeNull();
  });

  it("ignores free text riding along with a valid id", () => {
    const e = parseEmoteMessage({ id: "nice", text: "something rude" });
    expect(e?.text).toBe("Nice move!");
  });
});

describe("emote gate", () => {
  it("allows one per gap", () => {
    const g = createEmoteGate();
    expect(g.tryTake(0)).toBe(true);
    expect(g.tryTake(EMOTE_MIN_GAP_MS - 1)).toBe(false);
    expect(g.tryTake(EMOTE_MIN_GAP_MS)).toBe(true);
  });

  it("caps the burst inside the window, then frees up as it slides", () => {
    const g = createEmoteGate();
    let t = 0;
    for (let i = 0; i < EMOTE_BURST; i++, t += EMOTE_MIN_GAP_MS) expect(g.tryTake(t)).toBe(true);
    expect(g.tryTake(t)).toBe(false);
    expect(g.tryTake(EMOTE_WINDOW_MS)).toBe(true);
  });

  it("reports how long until the next send", () => {
    const g = createEmoteGate();
    expect(g.waitMs(0)).toBe(0);
    g.tryTake(0);
    expect(g.waitMs(100)).toBe(EMOTE_MIN_GAP_MS - 100);
    expect(g.waitMs(EMOTE_MIN_GAP_MS)).toBe(0);
    let t = EMOTE_MIN_GAP_MS;
    for (let i = 1; i < EMOTE_BURST; i++, t += EMOTE_MIN_GAP_MS) g.tryTake(t);
    // Burst spent: the wait runs to the end of the window, not just the gap.
    expect(g.waitMs(t)).toBe(EMOTE_WINDOW_MS - t);
  });

  it("gates are independent", () => {
    const a = createEmoteGate();
    const b = createEmoteGate();
    expect(a.tryTake(0)).toBe(true);
    expect(b.tryTake(0)).toBe(true);
  });
});
