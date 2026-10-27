"use client";

/**
 * VelocityMarquee — two bands of outline display type that drift in opposite
 * directions and answer the scroll: scroll faster and they race, scroll up
 * and they reverse, and the type skews with the speed (marqueeFactor,
 * marqueeSkew). Decorative (aria-hidden); reduced motion shows it still.
 */

import { useRef } from "react";
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
  wrap,
} from "motion/react";
import { useReducedMotionAfterMount } from "./useReducedMotionAfterMount";
import { marqueeFactor, marqueeSkew } from "./landingMotion";

const ROWS = [
  { words: ["Climb", "Don't look down", "The lava doesn't wait"], base: -2.2, ember: false },
  { words: ["Same tower", "Same lava", "One winner"], base: 1.8, ember: true },
];

function Row({ words, base, ember }: (typeof ROWS)[number]) {
  const reduce = useReducedMotionAfterMount();
  const { scrollY } = useScroll();
  const velocity = useSpring(useVelocity(scrollY), { damping: 50, stiffness: 400 });
  const skew = useTransform(velocity, (v) => `${marqueeSkew(v) * Math.sign(base)}deg`);
  const offset = useMotionValue(0);
  const x = useTransform(offset, (v) => `${wrap(-50, 0, v)}%`);
  const dir = useRef(1);

  useAnimationFrame((_, delta) => {
    if (reduce) return;
    const f = marqueeFactor(velocity.get());
    if (Math.abs(f) > 1.05) dir.current = Math.sign(f);
    offset.set(offset.get() + base * dir.current * Math.abs(f) * (delta / 1000));
  });

  const item = (
    <span className="flex shrink-0 items-center">
      {words.map((w) => (
        <span key={w} className="flex items-center">
          <span className={"marquee-outline px-6 " + (ember ? "marquee-outline--ember" : "")}>{w}</span>
          <span className={ember ? "text-ember" : "text-signal"}>▲</span>
        </span>
      ))}
    </span>
  );

  return (
    <motion.div className="flex whitespace-nowrap will-change-transform" style={{ x, skewX: skew }}>
      {item}
      {item}
      {item}
      {item}
    </motion.div>
  );
}

export function VelocityMarquee() {
  return (
    <div
      aria-hidden="true"
      className="relative overflow-hidden border-y border-border-subtle bg-void py-5 font-display text-5xl uppercase leading-[1.1] sm:text-7xl"
    >
      {ROWS.map((r) => (
        <Row key={r.words[0]} {...r} />
      ))}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-linear-to-r from-void to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-linear-to-l from-void to-transparent" />
    </div>
  );
}
