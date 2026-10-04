/**
 * Run moments: which beats of a climb get a callout, and which must not.
 *
 * Drives `stepMoments` the way useRunMoments does: one step per render
 * snapshot, memo threaded through. Each negative guard (no repeat, no first
 * lead, no callout while dead) is paired with a positive fixture that does
 * fire, so a guard that swallowed everything would fail here too.
 */

import { describe, expect, it } from "vitest";
import {
  CLOSE_CALL_COOLDOWN_TICKS,
  CLOSE_CALL_FT,
  initialMomentMemo,
  LAVA_DANGER_FT,
  LEAD_COOLDOWN_TICKS,
  LEAD_MARGIN_FT,
  MIN_BEST_FT,
  momentCopy,
  nextMilestone,
  stepMoments,
  type MomentInput,
  type MomentMemo,
  type RunMoment,
} from "../../src/components/Game/runMoments";
import { LAVA_DANGER_FT as HUD_DANGER_FT } from "../../src/components/Game/ExpeditionHud";

const BASE: MomentInput = { runId: 1, tick: 0, live: true, peakY: 0, clearance: 100 };

/** Feed a sequence of partial inputs; returns every moment that fired. */
function run(frames: Partial<MomentInput>[], memo: MomentMemo = initialMomentMemo(1)) {
  const out: RunMoment[] = [];
  let m = memo;
  frames.forEach((f, i) => {
    const r = stepMoments(m, { ...BASE, tick: i, ...f });
    m = r.memo;
    if (r.moment) out.push(r.moment);
  });
  return { moments: out, memo: m };
}

describe("milestones", () => {
  it("marks go 50, 100, then every 100", () => {
    expect([0, 49.9, 50, 99, 100, 150, 250].map(nextMilestone)).toEqual([50, 50, 100, 100, 200, 200, 300]);
  });

  it("fires each mark once as the peak climbs past it", () => {
    const { moments } = run([{ peakY: 10 }, { peakY: 50 }, { peakY: 60 }, { peakY: 55 }, { peakY: 101 }, { peakY: 199 }, { peakY: 200 }]);
    expect(moments).toEqual([
      { kind: "milestone", altitude: 50 },
      { kind: "milestone", altitude: 100 },
      { kind: "milestone", altitude: 200 },
    ]);
  });

  it("a jump past several marks calls only the highest", () => {
    const { moments, memo } = run([{ peakY: 320 }]);
    expect(moments).toEqual([{ kind: "milestone", altitude: 300 }]);
    expect(run([{ peakY: 340 }], memo).moments).toEqual([]);
  });
});

describe("new best", () => {
  it("fires once when the peak passes the previous best", () => {
    const { moments } = run([{ peakY: 30, bestY: 42 }, { peakY: 42, bestY: 42 }, { peakY: 42.5, bestY: 42 }, { peakY: 45, bestY: 42 }]);
    expect(moments).toEqual([{ kind: "new-best", altitude: 42 }]);
  });

  it("stays quiet with no best, or one too small to celebrate", () => {
    expect(run([{ peakY: 30, bestY: null }, { peakY: 40 }]).moments).toEqual([]);
    expect(run([{ peakY: 30, bestY: MIN_BEST_FT - 1 }]).moments).toEqual([]);
    expect(run([{ peakY: 30, bestY: MIN_BEST_FT }]).moments).toEqual([{ kind: "new-best", altitude: MIN_BEST_FT }]);
  });

  it("outranks a milestone crossed on the same step, and the milestone is not replayed later", () => {
    const { moments, memo } = run([{ peakY: 51, bestY: 48 }]);
    expect(moments).toEqual([{ kind: "new-best", altitude: 48 }]);
    expect(run([{ peakY: 52, bestY: 48 }], memo).moments).toEqual([]);
  });
});

describe("close call", () => {
  it("shares the HUD's danger line", () => {
    expect(LAVA_DANGER_FT).toBe(HUD_DANGER_FT);
  });

  it("fires on the climb back out after the lava got within reach", () => {
    const { moments } = run([
      { clearance: 30 },
      { clearance: CLOSE_CALL_FT },
      { clearance: 15 },
      { clearance: LAVA_DANGER_FT - 0.1 },
      { clearance: LAVA_DANGER_FT },
    ]);
    expect(moments).toEqual([{ kind: "close-call", altitude: 0 }]);
  });

  it("a scare that never got within CLOSE_CALL_FT is not a close call", () => {
    expect(run([{ clearance: CLOSE_CALL_FT + 0.5 }, { clearance: 40 }]).moments).toEqual([]);
  });

  it("does not fire while dead or caught (not live)", () => {
    expect(run([{ clearance: 2 }, { clearance: 40, live: false }]).moments).toEqual([]);
  });

  it("waits out the cooldown before calling another", () => {
    const frames: Partial<MomentInput>[] = [
      { tick: 0, clearance: 2 },
      { tick: 10, clearance: 30 },
      { tick: 20, clearance: 2 },
      { tick: 30, clearance: 30 },
      { tick: 10 + CLOSE_CALL_COOLDOWN_TICKS, clearance: 2 },
      { tick: 11 + CLOSE_CALL_COOLDOWN_TICKS, clearance: 30 },
    ];
    let memo = initialMomentMemo(1);
    const kinds: string[] = [];
    for (const f of frames) {
      const r = stepMoments(memo, { ...BASE, ...f });
      memo = r.memo;
      if (r.moment) kinds.push(`${r.moment.kind}@${f.tick}`);
    }
    expect(kinds).toEqual(["close-call@10", `close-call@${11 + CLOSE_CALL_COOLDOWN_TICKS}`]);
  });
});

describe("duel lead", () => {
  const at = (tick: number, myY: number, opponentY: number): Partial<MomentInput> => ({ tick, myY, opponentY });

  it("the first lead of the race is not news; a change is", () => {
    let memo = initialMomentMemo("d");
    const seen: (string | null)[] = [];
    for (const f of [at(0, 0, 0), at(30, 5, 0), at(300, 5, 9), at(600, 20, 9)]) {
      const r = stepMoments(memo, { ...BASE, runId: "d", ...f });
      memo = r.memo;
      seen.push(r.moment?.kind ?? null);
    }
    expect(seen).toEqual([null, null, "lost-lead", "took-lead"]);
  });

  it("a gap inside the margin keeps the current leader (no strobing)", () => {
    let memo = initialMomentMemo("d");
    const seen: (string | null)[] = [];
    const frames = [at(0, 10, 0), at(300, 10, 10 + LEAD_MARGIN_FT - 0.5), at(600, 10, 10 + LEAD_MARGIN_FT)];
    for (const f of frames) {
      const r = stepMoments(memo, { ...BASE, runId: "d", ...f });
      memo = r.memo;
      seen.push(r.moment?.kind ?? null);
    }
    expect(seen).toEqual([null, null, "lost-lead"]);
  });

  it("swaps inside the cooldown update the leader but are not called", () => {
    let memo = initialMomentMemo("d");
    const seen: (string | null)[] = [];
    const frames = [at(0, 10, 0), at(200, 10, 20), at(210, 30, 20), at(200 + LEAD_COOLDOWN_TICKS, 30, 40)];
    for (const f of frames) {
      const r = stepMoments(memo, { ...BASE, runId: "d", ...f });
      memo = r.memo;
      seen.push(r.moment?.kind ?? null);
    }
    expect(seen).toEqual([null, "lost-lead", null, "lost-lead"]);
  });

  it("no opponent height (stale ghost) means no lead call", () => {
    expect(run([{ myY: 10, opponentY: 0 }, { myY: 10, opponentY: null }, { myY: 10, opponentY: null }]).moments).toEqual([]);
  });
});

describe("runs", () => {
  it("a new run id resets everything", () => {
    const first = run([{ peakY: 60 }]);
    expect(first.moments).toHaveLength(1);
    const again = stepMoments(first.memo, { ...BASE, runId: 2, peakY: 60 });
    expect(again.moment).toEqual({ kind: "milestone", altitude: 50 });
  });

  it("copy covers every kind", () => {
    for (const kind of ["milestone", "new-best", "close-call", "took-lead", "lost-lead"] as const) {
      const c = momentCopy({ kind, altitude: 100 });
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.detail.length).toBeGreaterThan(0);
    }
    expect(momentCopy({ kind: "milestone", altitude: 200 }).title).toBe("200 ft");
  });
});
