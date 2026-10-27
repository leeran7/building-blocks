"use client";

/**
 * ScrollWords — a statement whose words light up as you scroll through it
 * (scroll-linked: scrolling back dims them again). Words marked `hot` heat up
 * to ember instead of white. The text is real text, rendered dim on the
 * server, so it reads without JS; reduced motion shows it fully lit.
 */

import { useRef } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useReducedMotionAfterMount } from "./useReducedMotionAfterMount";

export interface StatementWord {
  text: string;
  hot?: boolean;
}

/** Scroll window (fraction of progress) in which word i of n lights up. */
export function wordWindow(i: number, n: number): [number, number] {
  const start = i / n;
  return [start, Math.min(1, start + 1.6 / n)];
}

function Word({ word, range, progress }: { word: StatementWord; range: [number, number]; progress: MotionValue<number> }) {
  const opacity = useTransform(progress, range, [0.16, 1]);
  const y = useTransform(progress, range, ["0.18em", "0em"]);
  return (
    <motion.span className={"inline-block " + (word.hot ? "text-ember" : "text-text-primary")} style={{ opacity, y }}>
      {word.text}
    </motion.span>
  );
}

export function ScrollWords({ words, className }: { words: StatementWord[]; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const reduce = useReducedMotionAfterMount();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.45"] });

  return (
    <p ref={ref} className={className}>
      {words.map((w, i) => (
        <span key={i}>
          {reduce ? (
            <span className={w.hot ? "text-ember" : "text-text-primary"}>{w.text}</span>
          ) : (
            <Word word={w} range={wordWindow(i, words.length)} progress={scrollYProgress} />
          )}{" "}
        </span>
      ))}
    </p>
  );
}
