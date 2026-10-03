import { useCallback, useEffect, useId, useLayoutEffect, useState } from "react";

import { Button } from "../ui";
import { tapLight } from "../../lib/haptics";

export interface TourStep {
  /** `data-tour` value of the element to spotlight. A step whose target is missing is skipped. */
  target: string;
  title: string;
  body: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Room around the spotlit element, px. */
const PAD = 6;
/** Gap between the spotlight and the caption card, px. */
const GAP = 14;

/**
 * Coach marks: dims the screen, cuts a spotlight around one element at a
 * time and explains it in a card beside it. Steps whose element is not on
 * screen (no chests yet, say) are skipped. `onClose(true)` after the last
 * step, `onClose(false)` on Skip or Escape.
 */
export function AppTour({
  steps,
  onClose,
  finishLabel = "Got it",
}: {
  steps: readonly TourStep[];
  onClose: (finished: boolean) => void;
  finishLabel?: string;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const titleId = useId();
  const bodyId = useId();
  const step = steps[index] as TourStep | undefined;

  // Follow the target while the step is up: the map can still be settling
  // its scroll, and the bar resizes with the safe area.
  useLayoutEffect(() => {
    if (!step) return;
    let raf = 0;
    const measure = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      const r = el?.getBoundingClientRect();
      const next = r && r.width > 0 && r.height > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
      setRect((prev) => (sameRect(prev, next) ? prev : next));
      return next !== null;
    };
    if (!measure()) {
      // Not on this screen: move on, or end the tour after the last step.
      if (index < steps.length - 1) setIndex((i) => i + 1);
      else onClose(true);
      return;
    }
    const loop = () => {
      measure();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [step, index, steps.length, onClose]);

  const last = index >= steps.length - 1;
  const next = useCallback(() => {
    if (last) onClose(true);
    else setIndex((i) => i + 1);
  }, [last, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!step || !rect) return null;

  const hole = { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 };
  const viewH = typeof window === "undefined" ? 800 : window.innerHeight;
  const below = hole.top + hole.height / 2 < viewH / 2;
  const cardPos = below ? { top: hole.top + hole.height + GAP } : { bottom: viewH - hole.top + GAP };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      data-app-tour
      className="fixed inset-0 z-[60]"
    >
      {/* The dim layer is the spotlight's own shadow, so the hole is see-through. */}
      <div
        aria-hidden
        className="tour-hole pointer-events-none absolute rounded-[22px] border-2 border-signal/80 transition-[top,left,width,height] duration-300 ease-out motion-reduce:transition-none"
        style={{ ...hole, boxShadow: "0 0 0 9999px rgba(5,5,8,0.8), 0 0 24px 4px rgba(203,242,77,0.35)" }}
      />
      <div
        key={step.target}
        className="tour-card absolute inset-x-4 mx-auto max-w-sm rounded-3xl border border-white/10 bg-surface/95 px-4 pb-4 pt-3.5 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.9)] backdrop-blur-xl"
        style={cardPos}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-label font-bold uppercase tracking-eyebrow text-signal">
            {index + 1} of {steps.length}
          </p>
          <button
            type="button"
            onClick={() => {
              void tapLight();
              onClose(false);
            }}
            className="-mr-2 min-h-[44px] rounded-full px-3 font-mono text-label uppercase tracking-label text-text-secondary active:scale-95"
          >
            Skip tour
          </button>
        </div>
        <h2 id={titleId} className="font-display text-title font-black uppercase leading-none tracking-tight text-text-primary">
          {step.title}
        </h2>
        <p id={bodyId} className="mt-2 text-meta leading-snug text-text-secondary">
          {step.body}
        </p>
        <div className="mt-4">
          {/* Keyed per step so focus lands on it each time. */}
          <Button key={index} autoFocus onPress={next}>
            {last ? finishLabel : "Next"}
          </Button>
        </div>
      </div>
      <style>{`
        .tour-card { animation: tourIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both; }
        @keyframes tourIn { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }
        .tour-hole { animation: tourPulse 1.8s ease-in-out infinite; }
        @keyframes tourPulse { 0%, 100% { border-color: rgba(203,242,77,0.8); } 50% { border-color: rgba(203,242,77,0.35); } }
        @media (prefers-reduced-motion: reduce) { .tour-card, .tour-hole { animation: none; } }
      `}</style>
    </div>
  );
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}
