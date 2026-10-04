"use client";

import { useEffect, useRef, useState } from "react";
import {
  initialMomentMemo,
  momentCopy,
  stepMoments,
  type MomentInput,
  type MomentMemo,
  type RunMoment,
} from "./runMoments";
import "./expedition.css";

/** How long a callout stays on screen (ms). Matches the CSS animation. */
export const CALLOUT_MS = 1700;

export interface RunCalloutState {
  /** Bumps per callout so a repeat of the same kind restarts the animation. */
  id: number;
  moment: RunMoment;
}

/**
 * Watches the render snapshot for run moments (milestones, new best, close
 * call, lead changes) and holds the latest one on screen for CALLOUT_MS.
 * `onMoment` fires once per moment, for a sound or a haptic.
 */
export function useRunMoments(
  input: MomentInput,
  onMoment?: (moment: RunMoment) => void
): RunCalloutState | null {
  const memoRef = useRef<MomentMemo>(initialMomentMemo(input.runId));
  const idRef = useRef(0);
  const onMomentRef = useRef(onMoment);
  const [callout, setCallout] = useState<RunCalloutState | null>(null);

  useEffect(() => {
    onMomentRef.current = onMoment;
  }, [onMoment]);

  const { runId, tick, live, peakY, clearance, bestY = null, opponentY = null, myY = null } = input;
  useEffect(() => {
    const newRun = memoRef.current.runId !== runId;
    const { memo, moment } = stepMoments(memoRef.current, {
      runId, tick, live, peakY, clearance, bestY, opponentY, myY,
    });
    memoRef.current = memo;
    if (!moment) {
      // A callout left over from the last run doesn't carry into the next.
      if (newRun) setCallout(null);
      return;
    }
    idRef.current += 1;
    setCallout({ id: idRef.current, moment });
    try {
      onMomentRef.current?.(moment);
    } catch {
      /* a sound or haptic failing must not take the game down */
    }
  }, [runId, tick, live, peakY, clearance, bestY, opponentY, myY]);

  // Clear the callout after its animation.
  useEffect(() => {
    if (!callout) return;
    const t = setTimeout(() => setCallout((c) => (c?.id === callout.id ? null : c)), CALLOUT_MS);
    return () => clearTimeout(t);
  }, [callout]);

  return callout;
}

/** The on-stage callout: a big word that pops in and floats away. */
export function RunCallout({
  callout,
  topInset = 0,
  topPercent = 26,
}: {
  callout: RunCalloutState | null;
  topInset?: number;
  /** How far down the stage (percent) the callout sits; duels go lower to clear the race bars. */
  topPercent?: number;
}) {
  if (!callout) return null;
  const { title, detail } = momentCopy(callout.moment);
  return (
    <div className="exp-callout-layer" style={{ top: `calc(${topInset}px + ${topPercent}%)` }} role="status" aria-live="polite">
      <div key={callout.id} className="exp-callout" data-kind={callout.moment.kind}>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}
