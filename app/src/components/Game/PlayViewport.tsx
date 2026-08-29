"use client";

/**
 * Pins the climb to the phone's visible screen.
 *
 * `position: fixed; inset: 0` uses the layout viewport, which on mobile Safari
 * is often taller than what is actually on screen (URL bar, toolbars). This
 * sizes the stage to `visualViewport` so the canvas covers the phone edge to
 * edge, and grows/shrinks as browser chrome shows or hides.
 */

import { useLayoutEffect, useRef, type ReactNode } from "react";

export function PlayViewport({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const html = document.documentElement;
    html.classList.add("play-fullscreen");

    const layout = () => {
      const vv = window.visualViewport;
      if (!vv) {
        el.style.top = "0";
        el.style.left = "0";
        el.style.width = "100%";
        el.style.height = "100dvh";
        return;
      }
      el.style.top = `${vv.offsetTop}px`;
      el.style.left = `${vv.offsetLeft}px`;
      el.style.width = `${vv.width}px`;
      el.style.height = `${vv.height}px`;
    };

    layout();
    window.addEventListener("resize", layout);
    window.addEventListener("orientationchange", layout);
    vvListen(window.visualViewport, "resize", layout);
    vvListen(window.visualViewport, "scroll", layout);

    return () => {
      html.classList.remove("play-fullscreen");
      window.removeEventListener("resize", layout);
      window.removeEventListener("orientationchange", layout);
      vvUnlisten(window.visualViewport, "resize", layout);
      vvUnlisten(window.visualViewport, "scroll", layout);
    };
  }, []);

  return (
    <div ref={ref} className="play-viewport">
      {children}
    </div>
  );
}

function vvListen(
  vv: VisualViewport | null | undefined,
  type: "resize" | "scroll",
  fn: () => void
) {
  vv?.addEventListener(type, fn);
}

function vvUnlisten(
  vv: VisualViewport | null | undefined,
  type: "resize" | "scroll",
  fn: () => void
) {
  vv?.removeEventListener(type, fn);
}
