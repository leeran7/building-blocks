"use client";

/**
 * Reduced-motion preference that is `false` on the server and on the first
 * client render, then the real value. Motion's own useReducedMotion reads the
 * media query during the first render, so a component that renders a
 * different tree for reduced motion would not match its server HTML
 * (hydration error). CSS `motion-reduce:` variants still cover that first
 * paint.
 */

import { useEffect, useState } from "react";

export function useReducedMotionAfterMount(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduce;
}
