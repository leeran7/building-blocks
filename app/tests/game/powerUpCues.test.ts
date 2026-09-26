/**
 * Power-up feedback cues — the two defects that lived in the hook's refs.
 *
 * The hook used to keep `prevPickupTick` and `prevActiveKey` for the lifetime
 * of the mounted component. `start()` does not remount it, so a second run
 * inherited the first run's markers: a pickup landing on the same tick number
 * was silent, and a leftover effect name was announced as "ended" at the top
 * of a fresh climb. Repeating the same announcement string was also silent for
 * assistive tech, which only re-reads a live region when the text changes.
 *
 * These tests drive `stepCues` directly. A source-text grep of the hook would
 * not have caught any of this — the old hook had the refs, it just never
 * reset them.
 */

import { describe, it, expect } from "vitest";
import { POWER_UP_SPECS } from "../../src/game/powerups";
import {
  announcementText,
  initialCueMemo,
  lavaMusicIntensity,
  LAVA_MUSIC_RAMP_M,
  stepCues,
  type CueInput,
  type CueMemo,
} from "../../src/components/Game/powerUpCues";
import {
  DEFAULT_HAZARD_CONFIG,
  HAZARD_LEASH_M,
  hazardPhase,
} from "../../src/game/hazard";
import { TICK_DT } from "../../src/game/types";
import { createMatch, stepMatch } from "../../src/game/simulation";
import { NO_INPUT } from "../../src/game/types";
import { buildTower } from "../../src/game/towers";

function frame(
  memo: CueMemo,
  partial: Partial<CueInput> & Pick<CueInput, "runId">
) {
  return stepCues(memo, {
    lastPickupTick: null,
    lastPickupType: null,
    activeTypes: [],
    jetpackThrusting: false,
    lavaOnScreen: false,
    lavaNear: false,
    lavaPhase: "grace",
    lavaFill: 0,
    dead: false,
    ...partial,
  });
}

describe("stepCues: pickup is announced and scored", () => {
  it("fires pickup then activate, in that order, with the motif gap", () => {
    const { out } = frame(initialCueMemo(0), {
      runId: 0,
      lastPickupTick: 12,
      lastPickupType: "sprint-burst",
      activeTypes: ["sprint-burst"],
    });

    expect(out.sounds.map((s) => s.kind)).toEqual(["pickup", "activate"]);
    expect(out.sounds[1].delay).toBeGreaterThan(0);
    expect(announcementText(out.announcement ?? "")).toBe(
      `${POWER_UP_SPECS["sprint-burst"].label} activated. ${POWER_UP_SPECS["sprint-burst"].description}.`
    );
  });

  it("does not re-fire on the next tick of the same pickup", () => {
    let memo = initialCueMemo(0);
    const first = frame(memo, {
      runId: 0,
      lastPickupTick: 12,
      lastPickupType: "giant",
      activeTypes: ["giant"],
    });
    memo = first.memo;
    const second = frame(memo, {
      runId: 0,
      lastPickupTick: 12,
      lastPickupType: "giant",
      activeTypes: ["giant"],
    });

    expect(second.out.sounds).toEqual([]);
    expect(second.out.announcement).toBeNull();
  });
});

describe("stepCues: a new run does not inherit the previous run's cues", () => {
  it("does not announce 'ended' for an effect that died with the last run", () => {
    // Run 1 dies while sprint-burst is live — the common case, since power-ups
    // are what let you climb high enough for the lava to catch you.
    let memo = initialCueMemo(0);
    memo = frame(memo, {
      runId: 1,
      lastPickupTick: 80,
      lastPickupType: "sprint-burst",
      activeTypes: ["sprint-burst"],
    }).memo;

    const restarted = frame(memo, {
      runId: 2,
      lastPickupTick: null,
      lastPickupType: null,
      activeTypes: [],
    });

    expect(restarted.out.sounds.some((s) => s.kind === "expire")).toBe(false);
    expect(announcementText(restarted.out.announcement ?? "x")).not.toMatch(
      /ended/i
    );
  });

  it("still announces a pickup that lands on the same tick index as last run", () => {
    let memo = initialCueMemo(0);
    memo = frame(memo, {
      runId: 1,
      lastPickupTick: 40,
      lastPickupType: "rapid-climb",
      activeTypes: ["rapid-climb"],
    }).memo;

    const again = frame(memo, {
      runId: 2,
      lastPickupTick: 40,
      lastPickupType: "jetpack",
      activeTypes: ["jetpack"],
    });

    expect(again.out.sounds.map((s) => s.kind)).toEqual(["pickup", "activate"]);
    expect(announcementText(again.out.announcement ?? "")).toContain(
      POWER_UP_SPECS.jetpack.label
    );
  });
});

describe("stepCues: repeated announcements are distinct strings", () => {
  it("two identical pickups in a row produce different live-region text", () => {
    let memo = initialCueMemo(0);
    const first = frame(memo, {
      runId: 0,
      lastPickupTick: 10,
      lastPickupType: "giant",
      activeTypes: ["giant"],
    });
    const second = frame(first.memo, {
      runId: 0,
      lastPickupTick: 24,
      lastPickupType: "giant",
      activeTypes: ["giant"],
    });

    expect(first.out.announcement).not.toBeNull();
    expect(second.out.announcement).not.toBeNull();
    expect(second.out.announcement).not.toBe(first.out.announcement);
    expect(announcementText(first.out.announcement!)).toBe(
      announcementText(second.out.announcement!)
    );
  });

  it("speaks both expiry and pickup when they land on the same tick", () => {
    let memo = initialCueMemo(0);
    memo = frame(memo, {
      runId: 0,
      lastPickupTick: 10,
      lastPickupType: "sprint-burst",
      activeTypes: ["sprint-burst"],
    }).memo;

    const both = frame(memo, {
      runId: 0,
      lastPickupTick: 40,
      lastPickupType: "jetpack",
      activeTypes: ["jetpack"],
    });

    const text = announcementText(both.out.announcement ?? "");
    expect(text).toContain("ended");
    expect(text).toContain(POWER_UP_SPECS.jetpack.label);
    expect(both.out.sounds.map((s) => s.kind)).toEqual([
      "pickup",
      "activate",
      "expire",
    ]);
  });
});

describe("stepCues: jetpack thrust is a loop, not a one-shot", () => {
  it("turns the loop on while thrusting and off when the hold ends", () => {
    let memo = initialCueMemo(0);
    const on = frame(memo, { runId: 0, jetpackThrusting: true });
    expect(on.out.loops.jetpack).toBe(true);
    expect(on.out.sounds.some((s) => s.kind === "death")).toBe(false);
    memo = on.memo;
    const held = frame(memo, { runId: 0, jetpackThrusting: true });
    expect(held.out.loops.jetpack).toBe(true);
    expect(held.out.sounds).toEqual([]);
    const off = frame(held.memo, { runId: 0, jetpackThrusting: false });
    expect(off.out.loops.jetpack).toBe(false);
  });

  it("kills the thrust loop the moment the climber dies", () => {
    const { out } = frame(initialCueMemo(0), {
      runId: 0,
      jetpackThrusting: true,
      dead: true,
    });
    expect(out.loops.jetpack).toBe(false);
    expect(out.sounds.map((s) => s.kind)).toEqual(["death"]);
  });
});

describe("stepCues: lava on screen sounds like doom is coming", () => {
  it("fires the sting once when lava first enters the uncovered view", () => {
    let memo = initialCueMemo(0);
    const hidden = frame(memo, { runId: 0, lavaOnScreen: false, lavaFill: 0 });
    expect(hidden.out.sounds).toEqual([]);
    expect(hidden.out.loops.lavaDoom).toBe(false);
    const shown = frame(hidden.memo, {
      runId: 0,
      lavaOnScreen: true,
      lavaFill: 0.12,
    });
    expect(shown.out.sounds.map((s) => s.kind)).toEqual(["lava-sting"]);
    expect(shown.out.loops.lavaDoom).toBe(true);
    expect(shown.out.loops.lavaFill).toBe(0.12);
    expect(shown.out.announcement).toBeNull();
    const still = frame(shown.memo, {
      runId: 0,
      lavaOnScreen: true,
      lavaFill: 0.4,
    });
    expect(still.out.sounds).toEqual([]);
    expect(still.out.loops.lavaDoom).toBe(true);
    expect(still.out.loops.lavaFill).toBe(0.4);
    expect(still.out.announcement).toBeNull();
  });

  it("stings again if the climber climbs away and lava re-enters", () => {
    let memo = initialCueMemo(0);
    memo = frame(memo, { runId: 0, lavaOnScreen: true, lavaFill: 0.2 }).memo;
    memo = frame(memo, { runId: 0, lavaOnScreen: false, lavaFill: 0 }).memo;
    const again = frame(memo, { runId: 0, lavaOnScreen: true, lavaFill: 0.15 });
    expect(again.out.sounds.map((s) => s.kind)).toEqual(["lava-sting"]);
  });
});

describe("stepCues: death sounds like doom struck", () => {
  it("fires death once on the rising edge and not again while the overlay sits", () => {
    let memo = initialCueMemo(0);
    const hit = frame(memo, { runId: 0, dead: true, lavaOnScreen: true, lavaFill: 0.8 });
    expect(hit.out.sounds.map((s) => s.kind)).toEqual(["death"]);
    expect(hit.out.loops.lavaDoom).toBe(false);
    expect(hit.out.loops.jetpack).toBe(false);
    expect(hit.out.announcement).toBeNull();
    const sitting = frame(hit.memo, {
      runId: 0,
      dead: true,
      lavaOnScreen: true,
      lavaFill: 0.8,
    });
    expect(sitting.out.sounds).toEqual([]);
    expect(sitting.out.loops.lavaDoom).toBe(false);
  });

  it("does not layer the approaching sting on the same frame as the hit", () => {
    const { out } = frame(initialCueMemo(0), {
      runId: 0,
      lavaOnScreen: true,
      lavaFill: 0.3,
      dead: true,
    });
    expect(out.sounds.map((s) => s.kind)).toEqual(["death"]);
    expect(out.sounds.some((s) => s.kind === "lava-sting")).toBe(false);
  });

  it("a new run can die again after the previous run's death", () => {
    let memo = initialCueMemo(0);
    memo = frame(memo, { runId: 1, dead: true }).memo;
    const nextRun = frame(memo, { runId: 2, dead: false });
    expect(nextRun.out.sounds.some((s) => s.kind === "death")).toBe(false);
    const dies = frame(nextRun.memo, { runId: 2, dead: true });
    expect(dies.out.sounds.map((s) => s.kind)).toEqual(["death"]);
  });

  it("a new run can sting again after the previous run saw lava", () => {
    let memo = initialCueMemo(0);
    memo = frame(memo, { runId: 1, lavaOnScreen: true, lavaFill: 0.5 }).memo;
    const nextRun = frame(memo, { runId: 2, lavaOnScreen: true, lavaFill: 0.1 });
    expect(nextRun.out.sounds.map((s) => s.kind)).toEqual(["lava-sting"]);
  });

  it("fires death exactly once when a real idle run is caught", () => {
    const tower = buildTower("indie-games");
    const m = createMatch({
      seed: "cue-death",
      mode: "solo",
      tower,
      playerIds: ["p1"],
    });
    m.phase = "climb";
    m.tick = 0;
    let memo = initialCueMemo(1);
    let deathCues = 0;
    for (let i = 0; i < 20_000 && m.phase === "climb"; i++) {
      stepMatch(m, { p1: NO_INPUT });
      const stepped = frame(memo, {
        runId: 1,
        dead: m.players[0]!.status === "eliminated",
      });
      memo = stepped.memo;
      deathCues += stepped.out.sounds.filter((s) => s.kind === "death").length;
    }
    expect(m.players[0]!.status).toBe("eliminated");
    expect(deathCues).toBe(1);
  });
});

describe("stepCues: a lava surge is heard as it lands", () => {
  /** Thread frames through the memo, returning each frame's surge count. */
  function surges(
    runId: number,
    frames: Array<Partial<CueInput>>,
    start: CueMemo = initialCueMemo(runId)
  ): { counts: number[]; memo: CueMemo } {
    let memo = start;
    const counts: number[] = [];
    for (const f of frames) {
      const r = frame(memo, { runId, ...f });
      memo = r.memo;
      counts.push(r.out.sounds.filter((s) => s.kind === "lava-surge").length);
    }
    return { counts, memo };
  }

  it("fires exactly once on stumble → surge while the lava is on screen", () => {
    const { counts } = surges(0, [
      { lavaPhase: "surge", lavaOnScreen: true },
      { lavaPhase: "stumble", lavaOnScreen: true },
      { lavaPhase: "stumble", lavaOnScreen: true },
      { lavaPhase: "surge", lavaOnScreen: true },
      { lavaPhase: "surge", lavaOnScreen: true },
    ]);
    expect(counts).toEqual([0, 0, 0, 1, 0]);
  });

  it("fires when the lava is just below the view (proximity band)", () => {
    const { counts } = surges(0, [
      { lavaPhase: "stumble", lavaNear: true },
      { lavaPhase: "surge", lavaNear: true },
    ]);
    expect(counts).toEqual([0, 1]);
  });

  it("does not fire on grace → surge at run start", () => {
    const { counts } = surges(0, [
      { lavaPhase: "grace", lavaOnScreen: true },
      { lavaPhase: "surge", lavaOnScreen: true },
    ]);
    expect(counts).toEqual([0, 0]);
  });

  it("does not fire on the first frame of a run, even mid-surge", () => {
    const { counts } = surges(0, [{ lavaPhase: "surge", lavaOnScreen: true }]);
    expect(counts).toEqual([0]);
  });

  it("does not fire when the lava is off screen and out of the band", () => {
    const { counts } = surges(0, [
      { lavaPhase: "stumble" },
      { lavaPhase: "surge" },
    ]);
    expect(counts).toEqual([0, 0]);
  });

  it("does not fire once the climber is dead", () => {
    const { counts } = surges(0, [
      { lavaPhase: "stumble", lavaOnScreen: true, dead: true },
      { lavaPhase: "surge", lavaOnScreen: true, dead: true },
    ]);
    expect(counts).toEqual([0, 0]);
  });

  it("resets its memo on a new runId (no carried-over stumble)", () => {
    const first = surges(1, [{ lavaPhase: "stumble", lavaOnScreen: true }]);
    expect(first.memo.lavaPhase).toBe("stumble");
    const next = surges(2, [{ lavaPhase: "surge", lavaOnScreen: true }], first.memo);
    expect(next.counts).toEqual([0]);
    expect(next.memo.lavaPhase).toBe("surge");
  });

  it("fires once per stumble → surge edge along the real hazard timeline", () => {
    const cfg = DEFAULT_HAZARD_CONFIG;
    const seconds = cfg.graceSeconds + 4 * cfg.stumblePeriodSeconds + 1;
    let memo = initialCueMemo(0);
    let fired = 0;
    let edges = 0;
    let prev: string | null = null;
    for (let t = 0; t <= seconds; t += TICK_DT) {
      const phase = hazardPhase(t, cfg).phase;
      if (prev === "stumble" && phase === "surge") edges += 1;
      prev = phase;
      const r = frame(memo, { runId: 0, lavaPhase: phase, lavaOnScreen: true });
      memo = r.memo;
      fired += r.out.sounds.filter((s) => s.kind === "lava-surge").length;
    }
    expect(edges).toBe(4);
    expect(fired).toBe(edges);
  });

  it("quickens the doom loop only while the lava is on screen and surging", () => {
    const on = frame(initialCueMemo(0), { runId: 0, lavaPhase: "surge", lavaOnScreen: true });
    expect(on.out.loops.lavaSurging).toBe(true);
    const stumble = frame(on.memo, { runId: 0, lavaPhase: "stumble", lavaOnScreen: true });
    expect(stumble.out.loops.lavaSurging).toBe(false);
    const hidden = frame(on.memo, { runId: 0, lavaPhase: "surge", lavaOnScreen: false });
    expect(hidden.out.loops.lavaSurging).toBe(false);
  });
});

describe("lavaMusicIntensity: the track follows the leashed chase", () => {
  it("ramps over the leash band plus 40", () => {
    expect(LAVA_MUSIC_RAMP_M).toBe(HAZARD_LEASH_M + 40);
    expect(lavaMusicIntensity(LAVA_MUSIC_RAMP_M)).toBe(0);
    expect(lavaMusicIntensity(LAVA_MUSIC_RAMP_M + 100)).toBe(0);
    expect(lavaMusicIntensity(0)).toBe(1);
    expect(lavaMusicIntensity(-10)).toBe(1);
  });

  it("is audible at the leash distance, where the old 40m ramp was silent", () => {
    const atLeash = lavaMusicIntensity(HAZARD_LEASH_M);
    expect(atLeash).toBeGreaterThan(0.3);
    expect(atLeash).toBeLessThan(0.6);
  });

  it("is non-increasing in clearance and 0 for a non-number", () => {
    let prev = Infinity;
    for (let gap = -20; gap <= 120; gap += 5) {
      const v = lavaMusicIntensity(gap);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
    expect(lavaMusicIntensity(Number.NaN)).toBe(0);
    expect(lavaMusicIntensity(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
