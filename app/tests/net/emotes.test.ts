/**
 * Duel emotes travel as catalog ids; the receiver rejects anything else and
 * both ends rate-limit.
 */

import { describe, expect, it } from "vitest";
import {
  createEmoteGate,
  EMOTE_BURST,
  EMOTE_MIN_GAP_MS,
  EMOTE_WINDOW_MS,
  EMOTES,
  emoteById,
  parseEmoteMessage,
} from "../../src/net/emotes";

describe("emote catalog", () => {
  it("ids are unique and every entry parses back to itself", () => {
    expect(new Set(EMOTES.map((e) => e.id)).size).toBe(EMOTES.length);
    for (const e of EMOTES) expect(parseEmoteMessage({ id: e.id })).toBe(e);
  });

  it("has both emoji and quick messages", () => {
    expect(EMOTES.some((e) => e.kind === "emote")).toBe(true);
    expect(EMOTES.some((e) => e.kind === "message")).toBe(true);
  });

  it("rejects unknown ids, prototype keys and non-strings, never substituting one", () => {
    expect(parseEmoteMessage({ id: "gg" })?.text).toBe("GG");
    for (const bad of ["nope", "GG", "__proto__", "toString", "constructor", "hasOwnProperty", "", 7, null, undefined, { id: "gg" }]) {
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

  it("gates are independent", () => {
    const a = createEmoteGate();
    const b = createEmoteGate();
    expect(a.tryTake(0)).toBe(true);
    expect(b.tryTake(0)).toBe(true);
  });
});
