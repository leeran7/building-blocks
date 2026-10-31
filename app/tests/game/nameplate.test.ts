/**
 * Climber nameplates: solo runs never label your climber.
 *
 * Paints real matches through a recording context and reads back every
 * fillText call. The solo intro (countdown phase, no names) used to draw
 * "Guest" over the player's own climber.
 */

import { describe, expect, it } from "vitest";
import { paintClimbFrame, type PaintCtx } from "../../src/components/Game/paintClimbFrame";
import { createMatch } from "../../src/game/simulation";
import { buildTower } from "../../src/game/towers";

function textContext(): { ctx: PaintCtx; texts: string[] } {
  const texts: string[] = [];
  const gradient = { addColorStop() {} };
  const state: Record<string | symbol, unknown> = {};
  const ctx = new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === "fillText") return (t: string) => texts.push(t);
      if (prop === "measureText") return () => ({ width: 10 });
      if (typeof prop === "string" && prop.startsWith("create")) return () => gradient;
      return () => {};
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as PaintCtx;
  return { ctx, texts };
}

const OPTS = { width: 360, height: 640, includeHud: false } as const;

function soloMatch() {
  return createMatch({ seed: "nameplate", mode: "solo", tower: buildTower("indie-games"), playerIds: ["p1"] });
}

describe("paintClimbFrame: nameplates", () => {
  it("draws no nameplate over a solo climber in the intro countdown", () => {
    const m = soloMatch();
    expect(m.phase).toBe("countdown");
    const { ctx, texts } = textContext();
    paintClimbFrame(ctx, m, OPTS);
    expect(texts).not.toContain("Guest");
  });

  it("still labels you in a duel countdown when your name is known", () => {
    const m = soloMatch();
    const { ctx, texts } = textContext();
    paintClimbFrame(ctx, m, { ...OPTS, myId: "p1", playerNames: { p1: "Leeran" } });
    expect(texts).toContain("Leeran");
  });

  it("still reads Guest for an unnamed opponent", () => {
    const m = createMatch({
      seed: "nameplate",
      mode: "multiplayer",
      tower: buildTower("indie-games"),
      playerIds: ["p1", "p2"],
    });
    const { ctx, texts } = textContext();
    paintClimbFrame(ctx, m, { ...OPTS, myId: "p1", playerNames: { p1: "Leeran" } });
    expect(texts).toContain("Guest");
  });
});
