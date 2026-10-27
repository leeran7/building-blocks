"use client";

/**
 * AscentTrack — the hero's scroll track (pinning). A tall box whose sticky
 * child holds the TowerScene in place while scroll progress through the box
 * drives the climb. Desktop: it is the hero's right column and the pitch sits
 * sticky beside it. Phones: it follows the pitch full-bleed, so the first
 * screen is the pitch and the next one is the climb.
 *
 * Reduced motion: no pin (CSS motion-reduce variants), the scene shows its
 * start frame.
 */

import { useRef } from "react";
import { useScroll, useMotionValue } from "motion/react";
import { useReducedMotionAfterMount } from "./useReducedMotionAfterMount";
import { TowerScene } from "./TowerScene";

export function AscentTrack() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotionAfterMount();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 56px", "end end"] });
  const still = useMotionValue(0);

  return (
    <div
      ref={ref}
      className="relative -mx-4 h-[260svh] md:mx-0 md:h-[220svh] motion-reduce:h-auto md:motion-reduce:h-auto"
      data-ascent-track
    >
      <div className="sticky top-14 h-[calc(100svh-3.5rem)] md:py-6 motion-reduce:static motion-reduce:h-[80svh] md:motion-reduce:h-[80svh]">
        <div className="h-full overflow-hidden md:rounded-3xl md:border md:border-border-strong md:shadow-lifted">
          <TowerScene progress={reduce ? still : scrollYProgress} />
        </div>
      </div>
    </div>
  );
}
