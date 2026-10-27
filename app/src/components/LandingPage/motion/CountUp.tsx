"use client";

/**
 * CountUp — a number that rolls up from 0 when it scrolls into view
 * (scroll-triggered, once). The server renders the final value, so crawlers
 * and no-JS readers get the real number; reduced motion keeps it as is.
 */

import { useEffect, useRef } from "react";
import { animate, useInView } from "motion/react";
import { useReducedMotionAfterMount } from "./useReducedMotionAfterMount";
import { countUpValue } from "./landingMotion";

export function CountUp({ value, durationS = 1.4 }: { value: number; durationS?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotionAfterMount();
  const target = Math.round(value);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce || !inView) return;
    const controls = animate(0, 1, {
      duration: durationS,
      ease: "linear",
      onUpdate: (t) => {
        el.textContent = String(countUpValue(target, t));
      },
    });
    return () => controls.stop();
  }, [inView, reduce, target, durationS]);

  return (
    <span ref={ref} className="tabular-nums">
      {target}
    </span>
  );
}
