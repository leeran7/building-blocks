"use client";

/**
 * LavaChase — the lava follows you down the page.
 *
 * Below the hero, a molten glow sits at the bottom of the viewport. It runs
 * on the same rule as the hero scene (stepLavaGap): stand still and it rises,
 * scroll and it falls back. Behind the content (z-0, sections sit above), so
 * it never covers text; it only warms the gaps between cards.
 *
 * Desktop also gets the altitude rail on the right edge: a ruler where your
 * marker rises as you scroll down the page and an ember fill chases it on a
 * lagging spring.
 *
 * Decorative (aria-hidden). Reduced motion: neither renders.
 */

import { useState } from "react";
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react";
import { useReducedMotionAfterMount } from "./useReducedMotionAfterMount";
import { LAVA_GAP_MAX, LAVA_GAP_MIN, stepLavaGap } from "./landingMotion";

/** Glow height (vh) for a lava gap: a closed gap is a tall glow. */
export function chaseGlowVh(gap: number): number {
  const t = (LAVA_GAP_MAX - gap) / (LAVA_GAP_MAX - LAVA_GAP_MIN);
  return 6 + Math.min(1, Math.max(0, t)) * 22;
}

export function LavaChase() {
  const reduce = useReducedMotionAfterMount();
  const { scrollY, scrollYProgress } = useScroll();
  const speed = useVelocity(scrollY);
  const gap = useMotionValue(LAVA_GAP_MAX);
  const [past, setPast] = useState(false);

  useMotionValueEvent(scrollY, "change", (y) => {
    const track = document.querySelector("[data-ascent-track]");
    const end = track ? track.getBoundingClientRect().bottom + y : window.innerHeight;
    setPast(y + window.innerHeight * 0.6 > end);
  });

  useAnimationFrame((_, delta) => {
    if (reduce || !past) return;
    gap.set(stepLavaGap(gap.get(), delta / 1000, speed.get(), false));
  });

  const glow = useSpring(useTransform(gap, (g) => `${chaseGlowVh(g)}vh`), { stiffness: 80, damping: 20 });
  const lavaFill = useSpring(scrollYProgress, { stiffness: 30, damping: 16 });
  const fillH = useTransform(lavaFill, (p) => `${Math.max(0, p * 100 - 6)}%`);
  const marker = useTransform(scrollYProgress, (p) => `${p * 100}%`);

  if (reduce) return null;

  return (
    <div aria-hidden="true">
      <motion.div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-0 transition-opacity duration-700"
        style={{
          height: glow,
          opacity: past ? 1 : 0,
          background:
            "linear-gradient(to top, rgb(255 90 44 / 0.42), rgb(255 90 44 / 0.12) 45%, transparent)",
        }}
      />
      <div className="pointer-events-none fixed right-4 top-1/2 z-20 hidden h-[52vh] w-3 -translate-y-1/2 lg:block">
        <div className="altimeter absolute inset-y-0 left-1/2 w-px opacity-40" />
        <motion.div
          className="absolute inset-x-0 bottom-0 rounded-full bg-linear-to-t from-ember to-ember/0"
          style={{ height: fillH }}
        />
        <motion.div className="absolute left-1/2 -translate-x-1/2 translate-y-1/2" style={{ bottom: marker }}>
          <span className="block h-3 w-3 rotate-45 rounded-[2px] bg-signal shadow-signal" />
        </motion.div>
        <span className="absolute -top-6 left-1/2 -translate-x-1/2 font-mono text-[9px] uppercase tracking-[0.2em] text-text-muted">
          Top
        </span>
      </div>
    </div>
  );
}
