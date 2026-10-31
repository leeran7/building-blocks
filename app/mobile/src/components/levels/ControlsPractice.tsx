import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { createControlsPractice } from "@app/game/levels/training";
import { ClimbCanvas } from "@app/components/Game/ClimbCanvas";

import { useSettings } from "../../contexts/AppDataContext";
import { usePracticeLoop } from "../../lib/usePracticeLoop";

/**
 * The level intro's try-the-controls window: a live climb on the practice
 * tower, driven by the real on-screen controls the caller mounts at the
 * bottom of the screen, so a touch player feels each layout before Start.
 * Holds still (and stops stepping) while `active` is false.
 */
export function useControlsPractice(active: boolean) {
  const practice = useMemo(() => createControlsPractice(), []);
  return usePracticeLoop(practice, { active, keyboard: false });
}

/**
 * Below this height the intro, the window and the controls under it don't all
 * fit (an iPhone SE 1st gen is 568), so the intro keeps just the picker.
 */
const TOO_SHORT = "(max-height: 620px)";

function subscribeShort(onChange: () => void): () => void {
  const mq = window.matchMedia(TOO_SHORT);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** The screen is tall enough for the practice window and controls under the intro. */
export function useRoomForControlsPractice(): boolean {
  return !useSyncExternalStore(subscribeShort, () => window.matchMedia(TOO_SHORT).matches, () => false);
}

export function ControlsPracticeWindow({
  practice,
}: {
  practice: ReturnType<typeof useControlsPractice>;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const myAvatarId = useSettings().data?.avatarId ?? null;

  // The box is sized by CSS (full width, fixed height); the canvas follows it.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={boxRef}
      data-controls-practice
      className="relative mt-2.5 h-[118px] w-full overflow-hidden rounded-xl border border-border-strong bg-void [@media(max-height:700px)]:h-[88px]"
    >
      {size.width > 0 && (
        <ClimbCanvas
          state={practice.view.state}
          feed={practice.feed}
          width={size.width}
          height={size.height}
          includeHud={false}
          myAvatarId={myAvatarId}
        />
      )}
      <p className="pointer-events-none absolute left-2 top-1.5 rounded-full bg-void/70 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-label text-signal">
        Try them here
      </p>
    </div>
  );
}
