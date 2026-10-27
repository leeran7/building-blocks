"use client";

/**
 * StackCard — a mode card that drops onto the stack. Scrolled into view, each
 * card falls from above with a slight tilt and lands on a spring, one after
 * another like blocks stacking. With a mouse it tilts toward the pointer
 * (3D) and a signal spotlight follows it.
 *
 * Reduced motion: the card is simply there, no drop, no tilt.
 */

import { useRef, type PointerEvent, type ReactNode } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useReducedMotionAfterMount } from "./useReducedMotionAfterMount";
import { SPRING_DROP } from "./landingMotion";

/** Stagger (s) between cards landing. */
export const STACK_STAGGER_S = 0.13;

export function StackCard({ index, children }: { index: number; children: ReactNode }) {
  const reduce = useReducedMotionAfterMount();
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rotateY = useSpring(useTransform(px, [0, 1], [-9, 9]), { stiffness: 200, damping: 20 });
  const rotateX = useSpring(useTransform(py, [0, 1], [7, -7]), { stiffness: 200, damping: 20 });

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    px.set(x);
    py.set(y);
    ref.current.style.setProperty("--spot-x", `${x * 100}%`);
    ref.current.style.setProperty("--spot-y", `${y * 100}%`);
  };
  const onLeave = () => {
    px.set(0.5);
    py.set(0.5);
  };

  if (reduce) return <div className="h-full">{children}</div>;

  return (
    <div className="h-full [perspective:900px]">
      <motion.div
        ref={ref}
        className="group/stack relative h-full"
        initial={{ y: -180, rotate: (index - 1) * 5 + 3, opacity: 0 }}
        whileInView={{ y: 0, rotate: 0, opacity: 1 }}
        viewport={{ once: true, amount: 0.35 }}
        transition={{ ...SPRING_DROP, delay: index * STACK_STAGGER_S, opacity: { duration: 0.2, delay: index * STACK_STAGGER_S } }}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
      >
        {children}
        <div className="tilt-spot pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover/stack:opacity-100" />
      </motion.div>
    </div>
  );
}
