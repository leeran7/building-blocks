import { useEffect, useMemo, useRef, useState } from "react";
import { CharacterPreview, PREVIEW_FOOT_PAD } from "../CharacterPreview";
import { FIGURE_CANVAS_PX, FIGURE_PX } from "./towerGeometry";
import { CLIMB_LEAD_IN_S, climbDuration, climbFrameAt, climbPath } from "./mapClimb";

/**
 * The player's character climbing the tower from floor `from` to floor `to`:
 * along each floor to its ladder, up, and onto the next floor (mapClimb.ts).
 * It moves by style writes each frame, re-rendering only when the pose or the
 * facing changes. `onMove` gets the feet's height (px from the map's bottom)
 * each frame so the screen can scroll with it, `onLand` each floor reached,
 * and `onDone` fires once on the top floor.
 */
export function MapClimber({
  from,
  to,
  avatarId,
  onMove,
  onLand,
  onDone,
}: {
  from: number;
  to: number;
  avatarId: string | null;
  onMove?: (y: number) => void;
  onLand?: (floor: number) => void;
  onDone: () => void;
}) {
  const path = useMemo(() => climbPath(from, to), [from, to]);
  const ref = useRef<HTMLSpanElement>(null);
  const start = climbFrameAt(path, 0);
  const [look, setLook] = useState<{ pose: "idle" | "walk" | "climb"; facing: 1 | -1 }>({ pose: "idle", facing: 1 });
  const handlers = useRef({ onMove, onLand, onDone });
  handlers.current = { onMove, onLand, onDone };

  useEffect(() => {
    const total = climbDuration(path);
    let raf = 0;
    let began: number | null = null;
    let landed: number | null = null;
    let shown = { pose: "idle", facing: 1 };
    const frame = (now: number) => {
      began ??= now;
      const t = (now - began) / 1000 - CLIMB_LEAD_IN_S;
      const f = climbFrameAt(path, t);
      const el = ref.current;
      if (el) {
        el.style.left = `${f.x}%`;
        el.style.bottom = `${f.y - PREVIEW_FOOT_PAD}px`;
      }
      if (f.pose !== shown.pose || f.facing !== shown.facing) {
        shown = { pose: f.pose, facing: f.facing };
        setLook({ pose: f.pose, facing: f.facing });
      }
      handlers.current.onMove?.(f.y);
      if (f.landed !== null && f.landed !== landed) {
        landed = f.landed;
        handlers.current.onLand?.(f.landed);
      }
      if (t >= total) {
        handlers.current.onDone();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [path]);

  return (
    <span
      ref={ref}
      aria-hidden
      data-you-marker
      data-climbing
      className="pointer-events-none absolute z-10 flex -translate-x-1/2"
      style={{ left: `${start.x}%`, bottom: start.y - PREVIEW_FOOT_PAD }}
    >
      <CharacterPreview
        avatarId={avatarId}
        pose={look.pose}
        facing={look.facing}
        locked={false}
        figurePx={FIGURE_PX}
        sizePx={FIGURE_CANVAS_PX}
      />
    </span>
  );
}
