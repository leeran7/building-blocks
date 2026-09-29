/**
 * Level layout knobs (tower.gapReachFrac, oneLadderChance, minWalkM,
 * ladderHangM, ladderTopGapM). Each replaces part of the free stack's altitude
 * ramp on a level tower only; freeStackGolden.test.ts pins the free stack.
 * Hanging ladders need a jump to grab, and a short top holds the climber on
 * the ladder until they jump off onto the floor above.
 */

import { describe, expect, it } from "vitest";

import { createMatch, stepMatch, DEFAULT_SIM_CONFIG } from "../../src/game/simulation";
import {
  applyRunSeed,
  floorGapForFloor,
  floorHeight,
  floorIndexAt,
  ladderHangs,
  ladderHasShortTop,
  laddersForFloor,
  platformsForFloor,
} from "../../src/game/towers";
import { grantPowerUp } from "../../src/game/powerups";
import { buildFreeTower } from "../../src/game/freeStack";
import type { MatchState, PlayerInput, PlayerState, TowerSpec } from "../../src/game/types";
import { botInput } from "./greedyBot";

const IDLE: PlayerInput = { moveX: 0, jump: false, climbY: 0, usePowerUp: false };
const UP: PlayerInput = { ...IDLE, climbY: 1 };
const DOWN: PlayerInput = { ...IDLE, climbY: -1 };
const JUMP_UP: PlayerInput = { ...UP, jump: true };

function level(seed: string, fields: Partial<TowerSpec>): TowerSpec {
  return { ...applyRunSeed(buildFreeTower(), seed), difficulty: 0.4, ...fields };
}

function gapWidths(tower: TowerSpec, i: number): number[] {
  const pieces = platformsForFloor(tower, i);
  const out: number[] = [];
  for (let k = 1; k < pieces.length; k++) out.push(pieces[k]!.x0 - pieces[k - 1]!.x1);
  return out;
}

/** Walk around the wrapping tower between two ladder xs. */
function ringDist(a: number, b: number, w: number): number {
  const d = Math.abs(a - b) % w;
  return Math.min(d, w - d);
}

/** Shortest walk on floor i from an arriving ladder to a leaving one. */
function shortestWalk(tower: TowerSpec, i: number): number {
  let best = Infinity;
  for (const up of laddersForFloor(tower, i)) {
    for (const arrive of laddersForFloor(tower, i - 1)) {
      best = Math.min(best, ringDist(up.x, arrive.x, tower.widthM));
    }
  }
  return best;
}

describe("gapReachFrac", () => {
  it("sets every gap's width as a share of jump reach", () => {
    const at = (frac: number) => {
      const t = level("gap-knob", { gapReachFrac: frac });
      const ws: number[] = [];
      for (let i = 1; i < 60; i++) ws.push(...gapWidths(t, i));
      return ws;
    };
    const half = at(0.5);
    const max = at(0.75);
    expect(half.length).toBeGreaterThan(10);
    expect(max.length).toBeGreaterThan(10);
    for (const w of half) expect(w).toBeCloseTo(half[0]!, 9);
    for (const w of max) expect(w).toBeCloseTo(half[0]! * 1.5, 9);
  });

  it("rejects a share outside [0, 0.75]", () => {
    for (const bad of [0.76, -0.01, Number.NaN]) {
      expect(() => platformsForFloor(level(`gap-bad-${bad}`, { gapReachFrac: bad }), 5)).toThrow(RangeError);
    }
  });
});

describe("oneLadderChance", () => {
  it("sets how many floors have a single ladder up", () => {
    const singles = (chance: number) => {
      const t = level("ladder-count", { oneLadderChance: chance });
      let n = 0;
      for (let i = 0; i < 200; i++) if (laddersForFloor(t, i).length === 1) n++;
      return n;
    };
    // At 0, a floor still gets one ladder when no second spot is clear.
    expect(singles(1)).toBe(200);
    expect(singles(0)).toBeLessThan(singles(0.5));
    expect(singles(0.5)).toBeLessThan(singles(0.9));
  });

  it("rejects a chance outside [0, 1]", () => {
    expect(() => laddersForFloor(level("lc-bad", { oneLadderChance: 1.2 }), 3)).toThrow(RangeError);
  });
});

describe("minWalkM", () => {
  it("keeps every leaving ladder at least that far around the tower from the arriving one", () => {
    const base = { oneLadderChance: 1 };
    // Positive fixture: the unconstrained layout has shorter walks.
    const free = level("walk", base);
    let short = 0;
    for (let i = 1; i < 150; i++) if (shortestWalk(free, i) < 40) short++;
    expect(short).toBeGreaterThan(20);

    const t = level("walk", { ...base, minWalkM: 40 });
    for (let i = 1; i < 150; i++) expect(shortestWalk(t, i)).toBeGreaterThanOrEqual(40 - 1e-9);
  });

  it("places a floor's second ladder clear of the walk too", () => {
    const extraWalks = (tower: TowerSpec) => {
      const out: number[] = [];
      for (let i = 1; i < 200; i++) {
        const [, ...extras] = laddersForFloor(tower, i);
        for (const e of extras) {
          let d = Infinity;
          for (const a of laddersForFloor(tower, i - 1)) d = Math.min(d, ringDist(e.x, a.x, tower.widthM));
          out.push(d);
        }
      }
      return out;
    };
    const free = extraWalks(level("walk-extra", { oneLadderChance: 0 }));
    expect(free.filter((d) => d < 20).length).toBeGreaterThan(10);

    const walked = extraWalks(level("walk-extra", { oneLadderChance: 0, minWalkM: 20 }));
    expect(walked.length).toBeGreaterThan(20);
    for (const d of walked) expect(d).toBeGreaterThanOrEqual(20 - 1e-9);
  });

  it("counts the walk across the tower's wrap seam", () => {
    // Floors whose arriving ladder sits near an edge would pass a linear
    // check with a leaving ladder just across the seam.
    const t = level("walk-seam", { oneLadderChance: 1, minWalkM: 45 });
    let nearEdge = 0;
    for (let i = 1; i < 200; i++) {
      const arrive = laddersForFloor(t, i - 1)[0]!.x;
      if (arrive < 25 || arrive > t.widthM - 25) nearEdge++;
      expect(shortestWalk(t, i)).toBeGreaterThanOrEqual(45 - 1e-9);
    }
    expect(nearEdge).toBeGreaterThan(10);
  });

  it("rejects a walk longer than half the tower", () => {
    expect(() => laddersForFloor(level("walk-bad", { minWalkM: 51 }), 3)).toThrow(RangeError);
    expect(() => laddersForFloor(level("walk-bad", { minWalkM: -1 }), 3)).toThrow(RangeError);
  });
});

describe("hanging ladders and short tops: geometry", () => {
  it("lift every ladder's bottom when no share is set", () => {
    const t = level("hang-geo", { ladderHangM: 1.5 });
    for (let i = 0; i < 40; i++) {
      for (const l of laddersForFloor(t, i)) {
        expect(l.y0).toBeCloseTo(floorHeight(t, i) + 1.5, 9);
        expect(l.y1).toBeCloseTo(floorHeight(t, i + 1), 9);
      }
    }
  });

  it("lower the top only of tall ladders: across a floor gap at least the base gap", () => {
    const t = level("top-geo", { ladderTopGapM: 0.8 });
    let short = 0;
    let full = 0;
    for (let i = 0; i < 80; i++) {
      const tall = floorGapForFloor(t, i) >= t.floorGap;
      laddersForFloor(t, i).forEach((l, slot) => {
        expect(ladderHasShortTop(t, i, slot)).toBe(tall);
        expect(l.y0).toBeCloseTo(floorHeight(t, i), 9);
        expect(l.y1).toBeCloseTo(floorHeight(t, i + 1) - (tall ? 0.8 : 0), 9);
        if (tall) short++;
        else full++;
      });
    }
    expect(short).toBeGreaterThan(10);
    expect(full).toBeGreaterThan(10);
  });

  it("never give a hanging ladder a short top", () => {
    const t = level("mixed-geo", { ladderHangM: 1.5, hangingLadderShare: 0.5, ladderTopGapM: 0.8 });
    let hungTall = 0;
    let shortTops = 0;
    for (let i = 0; i < 120; i++) {
      laddersForFloor(t, i).forEach((l, slot) => {
        const hangs = ladderHangs(t, i, slot);
        if (hangs && floorGapForFloor(t, i) >= t.floorGap) hungTall++;
        if (hangs) {
          expect(ladderHasShortTop(t, i, slot)).toBe(false);
          expect(l.y1).toBeCloseTo(floorHeight(t, i + 1), 9);
        }
        if (ladderHasShortTop(t, i, slot)) shortTops++;
      });
    }
    // Both halves of the rule are exercised: tall ladders that hang, and short tops.
    expect(hungTall).toBeGreaterThan(5);
    expect(shortTops).toBeGreaterThan(5);
    // Every ladder hanging leaves no short tops at all.
    const allHang = level("mixed-geo", { ladderHangM: 1.5, ladderTopGapM: 0.8 });
    for (let i = 0; i < 40; i++) {
      laddersForFloor(allHang, i).forEach((_, slot) => expect(ladderHasShortTop(allHang, i, slot)).toBe(false));
    }
  });

  it("stop short on about shortTopShare of tall ladders, the same ones every time", () => {
    const count = (share: number) => {
      const t = level("top-share", { ladderTopGapM: 0.8, shortTopShare: share });
      let short = 0;
      let tall = 0;
      for (let i = 0; i < 300; i++) {
        if (floorGapForFloor(t, i) < t.floorGap) continue;
        laddersForFloor(t, i).forEach((_, slot) => {
          tall++;
          if (ladderHasShortTop(t, i, slot)) short++;
        });
      }
      return { short, tall };
    };
    const half = count(0.5);
    expect(half.tall).toBeGreaterThan(100);
    expect(half.short / half.tall).toBeGreaterThan(0.4);
    expect(half.short / half.tall).toBeLessThan(0.6);
    expect(count(0.5).short).toBe(half.short);
    expect(count(0).short).toBe(0);
    expect(count(1).short).toBe(count(1).tall);
    for (const bad of [-0.1, 1.1, Number.NaN]) {
      expect(() => laddersForFloor(level("top-share", { ladderTopGapM: 0.8, shortTopShare: bad }), 0)).toThrow(RangeError);
    }
  });

  it("stay within 70% of the jump that has to clear them", () => {
    // Free tower: a standing jump rises 15² / (2·40) = 2.81 m, a ladder jump
    // (0.7× speed) rises 1.38 m, so the caps are 1.97 m and 0.96 m.
    expect(() => laddersForFloor(level("cap", { ladderHangM: 1.95 }), 1)).not.toThrow();
    expect(() => laddersForFloor(level("cap", { ladderHangM: 2.0 }), 1)).toThrow(RangeError);
    expect(() => laddersForFloor(level("cap", { ladderTopGapM: 0.95 }), 1)).not.toThrow();
    expect(() => laddersForFloor(level("cap", { ladderTopGapM: 1.0 }), 1)).toThrow(RangeError);
    expect(() => laddersForFloor(level("cap", { ladderHangM: -0.1 }), 1)).toThrow(RangeError);
  });
});

/** A solo match at GO with the climber standing under floor 0's first ladder. */
function underFirstLadder(tower: TowerSpec): MatchState {
  const live = createMatch({ seed: tower.seed, mode: "solo", tower, playerIds: ["p"] });
  while (live.phase === "countdown") stepMatch(live, {}, DEFAULT_SIM_CONFIG);
  live.players[0].x = laddersForFloor(tower, 0)[0]!.x;
  return live;
}

function run(live: MatchState, input: PlayerInput, ticks: number): PlayerState {
  for (let k = 0; k < ticks; k++) stepMatch(live, { p: input }, DEFAULT_SIM_CONFIG);
  return live.players[0];
}

describe("hanging ladders and short tops: climbing", () => {
  it("a hanging ladder can't be grabbed from the floor, only with a jump", () => {
    const plain = underFirstLadder(level("hang-sim", {}));
    expect(run(plain, UP, 2).onLadder).toBe(true);

    const hung = underFirstLadder(level("hang-sim", { ladderHangM: 1.5 }));
    const p = run(hung, UP, 30);
    expect(p.onLadder).toBe(false);
    expect(p.y).toBe(0);
    run(hung, JUMP_UP, 1);
    expect(run(hung, UP, 12).onLadder).toBe(true);
  });

  it("climbing down off a hanging ladder drops to the floor instead of standing in the air", () => {
    const tower = level("hang-down", { ladderHangM: 1.5 });
    const live = underFirstLadder(tower);
    run(live, JUMP_UP, 1);
    run(live, UP, 30);
    expect(live.players[0].onLadder).toBe(true);
    let p = run(live, DOWN, 1);
    for (let k = 0; k < 120 && p.onLadder; k++) p = run(live, DOWN, 1);
    expect(p.onLadder).toBe(false);
    expect(p.y).toBeCloseTo(1.5, 9);
    expect(p.onGround).toBe(false);
    p = run(live, IDLE, 30);
    expect(p.y).toBe(0);
    expect(p.onGround).toBe(true);
  });

  it("a full ladder on a short-top tower steps off onto the floor without a jump", () => {
    const tower = level("top-full", { ladderTopGapM: 0.9 });
    let floor = -1;
    for (let i = 0; i < 50 && floor < 0; i++) if (floorGapForFloor(tower, i) < tower.floorGap) floor = i;
    expect(floor).toBeGreaterThanOrEqual(0);
    const l = laddersForFloor(tower, floor)[0]!;
    expect(l.y1).toBe(floorHeight(tower, floor + 1));
    const live = createMatch({ seed: tower.seed, mode: "solo", tower, playerIds: ["p"] });
    while (live.phase === "countdown") stepMatch(live, {}, DEFAULT_SIM_CONFIG);
    const p0 = live.players[0];
    p0.x = l.x;
    p0.y = floorHeight(tower, floor);
    p0.onGround = true;
    let p = run(live, UP, 1);
    for (let k = 0; k < 200 && (p.onLadder || !p.onGround); k++) p = run(live, UP, 1);
    expect(p.onLadder).toBe(false);
    expect(p.onGround).toBe(true);
    expect(p.y).toBe(floorHeight(tower, floor + 1));
  });

  it("a short top holds the climber until they jump onto the floor above", () => {
    const plainTower = level("top-sim", {});
    const plain = underFirstLadder(plainTower);
    const reached = run(plain, UP, 150);
    expect(reached.y).toBeGreaterThanOrEqual(floorHeight(plainTower, 1));

    const tower = level("top-sim", { ladderTopGapM: 0.9 });
    expect(ladderHasShortTop(tower, 0, 0)).toBe(true);
    const live = underFirstLadder(tower);
    const top = laddersForFloor(tower, 0)[0]!.y1;
    let p = run(live, UP, 150);
    expect(p.onLadder).toBe(true);
    expect(p.y).toBe(top);
    p = run(live, UP, 60);
    expect(p.y).toBe(top);

    run(live, JUMP_UP, 1);
    p = run(live, IDLE, 40);
    expect(p.onGround).toBe(true);
    expect(p.y).toBe(floorHeight(tower, 1));
  });
});

/** The greedy bot, plus a jump to reach hanging ladders and leave short tops. */
function levelBot(p: PlayerState, tower: TowerSpec, tick: number): PlayerInput {
  if (p.onLadder && p.ladderIx !== null && p.ladderSlot !== null) {
    const l = laddersForFloor(tower, p.ladderIx)[p.ladderSlot]!;
    return p.y >= l.y1 && ladderHasShortTop(tower, p.ladderIx, p.ladderSlot) ? JUMP_UP : UP;
  }
  const base = botInput(p, tower, tick);
  return base.climbY > 0 && p.onGround ? { ...base, jump: true } : base;
}

describe("a level with every layout knob is climbable", () => {
  it("a bot that jumps for hanging ladders and short tops reaches the diamond", () => {
    const tower = level("knobs-run", {
      gapReachFrac: 0.6,
      oneLadderChance: 0.7,
      minWalkM: 30,
      ladderHangM: 1.5,
      ladderTopGapM: 0.8,
    });
    const t = { ...tower, goalM: floorHeight(tower, 5) };
    const live = createMatch({ seed: "knobs-run", mode: "solo", tower: t, playerIds: ["bot"] });
    while (live.phase === "countdown") stepMatch(live, {}, DEFAULT_SIM_CONFIG);
    while (live.phase === "climb" && live.tick < 20_000) {
      stepMatch(live, { bot: levelBot(live.players[0], t, live.tick) }, DEFAULT_SIM_CONFIG);
    }
    expect(live.players[0].status).toBe("finished");
  });
});

describe("hanging ladders: which ones hang", () => {
  const hanging = (t: TowerSpec, floors: number) => {
    let hung = 0;
    let total = 0;
    for (let i = 0; i < floors; i++) {
      laddersForFloor(t, i).forEach((l, slot) => {
        const hangs = ladderHangs(t, i, slot);
        expect(l.y0).toBeCloseTo(floorHeight(t, i) + (hangs ? 1.5 : 0), 9);
        if (hangs) hung++;
        total++;
      });
    }
    return { hung, total };
  };

  it("hangs every ladder when no share is set, or the share is 1", () => {
    for (const t of [level("share", { ladderHangM: 1.5 }), level("share", { ladderHangM: 1.5, hangingLadderShare: 1 })]) {
      const { hung, total } = hanging(t, 120);
      expect(total).toBeGreaterThan(120);
      expect(hung).toBe(total);
    }
  });

  it("hangs about that share of ladders, the same ones every time", () => {
    const t = level("share", { ladderHangM: 1.5, hangingLadderShare: 0.5 });
    const { hung, total } = hanging(t, 200);
    expect(hung / total).toBeGreaterThan(0.4);
    expect(hung / total).toBeLessThan(0.6);
    expect(hanging(level("share", { ladderHangM: 1.5, hangingLadderShare: 0.5 }), 200).hung).toBe(hung);
    expect(hanging(level("share", { ladderHangM: 1.5, hangingLadderShare: 0 }), 200).hung).toBe(0);
  });

  it("refuses a share outside [0, 1]", () => {
    for (const bad of [-0.1, 1.1, Number.NaN]) {
      expect(() => laddersForFloor(level("share", { ladderHangM: 1.5, hangingLadderShare: bad }), 1)).toThrow(RangeError);
    }
  });

  it("lets a climber step off a ladder that does not hang onto the floor", () => {
    const tower = level("hang-down", { ladderHangM: 1.5, hangingLadderShare: 0 });
    const live = underFirstLadder(tower);
    run(live, UP, 30);
    expect(live.players[0].onLadder).toBe(true);
    let p = run(live, DOWN, 1);
    for (let k = 0; k < 120 && p.onLadder; k++) p = run(live, DOWN, 1);
    expect(p.onLadder).toBe(false);
    expect(p.y).toBe(0);
    expect(p.onGround).toBe(true);
  });
});

describe("Giant and hanging ladders", () => {
  it("grabs a hanging ladder straight from the floor, which a plain climber can't", () => {
    const tower = level("hang-sim", { ladderHangM: 1.5 });
    const plain = underFirstLadder(tower);
    expect(run(plain, UP, 30).onLadder).toBe(false);

    const live = underFirstLadder(tower);
    grantPowerUp(live.players[0], "giant", live.tick);
    const p = run(live, UP, 1);
    expect(p.onLadder).toBe(true);
    expect(p.y).toBeGreaterThanOrEqual(1.5);
    expect(run(live, UP, 30).y).toBeGreaterThan(3);
  });
});
