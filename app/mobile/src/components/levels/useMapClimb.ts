import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { prefersReducedMotion } from "../../lib/motion";
import type { SeenFloorStore } from "../../lib/levels/seenFloor";
import { climbFrom } from "./mapClimb";

interface Plan {
  /** `${season}:${frontier}`: the frontier this plan was made for. */
  key: string;
  season: number;
  from: number;
  to: number;
  /** Pending waits for `clear`; active is playing. */
  phase: "pending" | "active";
}

/**
 * When the map shows a higher frontier than it last showed this player, climb
 * their character up from the old floor (MapClimber). The climb waits while
 * the map is covered (`clear` false: a start card opened by Next level, the
 * tour), standing the figure on the old floor meanwhile, so a run of wins
 * played back to back climbs every floor once the map is uncovered. The new
 * floor is saved when the climb starts. Reduced motion, a first visit and a
 * new season stand the figure on the frontier with no climb.
 *
 * `planned` is false until this frontier has been checked, so the screen can
 * hold its first scroll until it knows which floor the figure is on.
 */
export function useMapClimb({
  season,
  frontier,
  store,
  clear,
}: {
  season: number | null;
  frontier: number;
  store: SeenFloorStore;
  clear: boolean;
}): {
  planned: boolean;
  standOn: number;
  climb: { from: number; to: number } | null;
  finish: () => void;
} {
  const [plan, setPlan] = useState<Plan | { key: string; phase: "none" } | null>(null);
  const key = season === null ? null : `${season}:${frontier}`;

  useLayoutEffect(() => {
    if (season === null || key === null) return;
    // An active climb finishes first; a pending one is re-planned for the new frontier.
    if (plan?.key === key || plan?.phase === "active") return;
    const from = prefersReducedMotion() ? null : climbFrom(store.get(season), frontier);
    if (from === null) {
      store.set(season, frontier);
      setPlan({ key, phase: "none" });
    } else {
      setPlan({ key, season, from, to: frontier, phase: "pending" });
    }
  }, [key, plan, season, frontier, store]);

  useEffect(() => {
    if (plan?.phase !== "pending" || !clear) return;
    store.set(plan.season, plan.to);
    setPlan({ ...plan, phase: "active" });
  }, [plan, clear, store]);

  const finish = useCallback(() => setPlan((p) => (p && p.phase === "active" ? { key: p.key, phase: "none" } : p)), []);

  const planned = plan !== null && plan.key === key;
  if (plan && plan.phase !== "none" && "from" in plan) {
    return {
      planned,
      standOn: plan.phase === "pending" ? plan.from : plan.to,
      climb: plan.phase === "active" ? { from: plan.from, to: plan.to } : null,
      finish,
    };
  }
  return { planned, standOn: frontier, climb: null, finish };
}
