/**
 * Run moments: the beats of a climb worth a callout on screen.
 *
 *   - milestone   peak height crosses 50 ft, 100 ft, then every 100 ft
 *   - new-best    peak height passes the player's previous best (once a run)
 *   - close-call  the lava got within CLOSE_CALL_FT and the player climbed
 *                 back out past the HUD's danger line
 *   - took-lead / lost-lead   duel only: the lead changes hands
 *
 * Pure and display-only: it reads the render-side match snapshot and never
 * feeds the simulation, so it cannot desync a replay. `stepMoments` returns at
 * most one moment per step (the most important one); lesser beats crossed on
 * the same step are marked as seen, not queued, so a callout never lags the
 * action it describes.
 */

export type RunMomentKind =
  | "milestone"
  | "new-best"
  | "close-call"
  | "took-lead"
  | "lost-lead";

export interface RunMoment {
  kind: RunMomentKind;
  /** Height the moment is about (milestone mark, or the best just beaten). */
  altitude: number;
}

/**
 * Clearance (ft) at or under which the lava readout turns to danger: ~2.7 s
 * at a 9 ft/s ladder. The leash keeps the lava a few tens of feet behind a
 * good climber, so the old 12 ft (~1.3 s) warned too late to act on.
 */
export const LAVA_DANGER_FT = 24;
/** Lava gap (ft) that arms a close call. ~0.9 s at a 9 ft/s ladder. */
export const CLOSE_CALL_FT = 8;
/** Ticks (30 Hz) between two close-call callouts. */
export const CLOSE_CALL_COOLDOWN_TICKS = 8 * 30;
/** A lead only counts once it is at least this many feet. */
export const LEAD_MARGIN_FT = 2;
/** Ticks between two lead-change callouts, so a neck-and-neck race doesn't strobe. */
export const LEAD_COOLDOWN_TICKS = 4 * 30;
/** A previous best under this is too small to celebrate beating. */
export const MIN_BEST_FT = 10;

/** The first milestone mark above `passed` (0 → 50 → 100 → 200 → 300 …). */
export function nextMilestone(passed: number): number {
  if (passed < 50) return 50;
  return (Math.floor(passed / 100) + 1) * 100;
}

export interface MomentInput {
  /** Changes when a new run starts; the memo resets with it. */
  runId: number | string;
  tick: number;
  /** True only while the player is climbing in a live run. */
  live: boolean;
  peakY: number;
  /** Player height minus lava height. */
  clearance: number;
  /** The best height before this run, if known. */
  bestY?: number | null;
  /** Duel only: the opponent's current height. */
  opponentY?: number | null;
  /** Duel only: the player's current height (the lead compares heights, not peaks). */
  myY?: number | null;
}

export interface MomentMemo {
  runId: number | string;
  /** Highest milestone mark already called (0 = none). */
  milestone: number;
  bestCalled: boolean;
  /** Lava came within CLOSE_CALL_FT; waiting for the climb back out. */
  closeArmed: boolean;
  lastCloseTick: number;
  leader: "me" | "opponent" | null;
  lastLeadTick: number;
}

export function initialMomentMemo(runId: number | string): MomentMemo {
  return {
    runId,
    milestone: 0,
    bestCalled: false,
    closeArmed: false,
    lastCloseTick: -Infinity,
    leader: null,
    lastLeadTick: -Infinity,
  };
}

/** When several moments land on one step, the highest wins. */
const PRIORITY: Record<RunMomentKind, number> = {
  "new-best": 5,
  "close-call": 4,
  "took-lead": 3,
  "lost-lead": 3,
  milestone: 1,
};

export function stepMoments(
  prev: MomentMemo,
  input: MomentInput
): { memo: MomentMemo; moment: RunMoment | null } {
  const memo = prev.runId === input.runId ? { ...prev } : initialMomentMemo(input.runId);
  if (!input.live) return { memo, moment: null };

  const candidates: RunMoment[] = [];

  // New best: once per run, and only over a best worth beating.
  const best = input.bestY ?? 0;
  if (!memo.bestCalled && best >= MIN_BEST_FT && input.peakY > best) {
    memo.bestCalled = true;
    candidates.push({ kind: "new-best", altitude: best });
  }

  // Close call: arm when the lava gets close, fire on the way back out.
  if (input.clearance <= CLOSE_CALL_FT) {
    memo.closeArmed = true;
  } else if (memo.closeArmed && input.clearance >= LAVA_DANGER_FT) {
    memo.closeArmed = false;
    if (input.tick - memo.lastCloseTick >= CLOSE_CALL_COOLDOWN_TICKS) {
      memo.lastCloseTick = input.tick;
      candidates.push({ kind: "close-call", altitude: input.peakY });
    }
  }

  // Lead change: hysteresis on the margin, and only a CHANGE is called — the
  // first lead of a race is just the start, not news.
  if (typeof input.opponentY === "number" && typeof input.myY === "number") {
    const gap = input.myY - input.opponentY;
    const now = gap >= LEAD_MARGIN_FT ? "me" : gap <= -LEAD_MARGIN_FT ? "opponent" : memo.leader;
    if (now !== memo.leader) {
      const changed = memo.leader !== null;
      memo.leader = now;
      if (changed && input.tick - memo.lastLeadTick >= LEAD_COOLDOWN_TICKS) {
        memo.lastLeadTick = input.tick;
        candidates.push({ kind: now === "me" ? "took-lead" : "lost-lead", altitude: input.myY });
      }
    }
  }

  // Milestones: jump straight to the highest mark crossed (a jetpack can skip several).
  let mark = 0;
  for (let next = nextMilestone(memo.milestone); input.peakY >= next; next = nextMilestone(next)) {
    mark = next;
  }
  if (mark > 0) {
    memo.milestone = mark;
    candidates.push({ kind: "milestone", altitude: mark });
  }

  if (candidates.length === 0) return { memo, moment: null };
  candidates.sort((a, b) => PRIORITY[b.kind] - PRIORITY[a.kind]);
  return { memo, moment: candidates[0] };
}

/** Headline and small print for a moment's callout. */
export function momentCopy(moment: RunMoment): { title: string; detail: string } {
  switch (moment.kind) {
    case "milestone":
      return { title: `${moment.altitude} ft`, detail: milestoneCheer(moment.altitude) };
    case "new-best":
      return { title: "New best!", detail: `past ${Math.floor(moment.altitude)} ft` };
    case "close-call":
      return { title: "Close call!", detail: "out of the lava's reach" };
    case "took-lead":
      return { title: "You lead!", detail: "keep climbing" };
    case "lost-lead":
      return { title: "Overtaken!", detail: "catch them" };
  }
}

const CHEERS = ["Keep going", "On fire", "Unstoppable", "Sky high", "Legendary"] as const;

function milestoneCheer(altitude: number): string {
  if (altitude < 100) return "Nice start";
  const i = Math.min(CHEERS.length - 1, Math.floor(altitude / 100) - 1);
  return CHEERS[i];
}
