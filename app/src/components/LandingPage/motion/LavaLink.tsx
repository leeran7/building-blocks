"use client";

/**
 * LavaLink — a next/link that leaves the landing under a lava flood: on a
 * plain click the lava rises over the page (FLOOD_S), then the router
 * navigates. `magnetic` makes it lean toward a fine pointer, like a hold
 * pulling you in.
 *
 * It stays a real link: modified clicks (new tab, middle click), reduced
 * motion and no-JS all get the browser's normal navigation, and keyboard
 * Enter goes through the same flood as a click.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useRef, useState, type ComponentProps, type MouseEvent, type PointerEvent } from "react";
import { motion, useMotionValueEvent, useSpring } from "motion/react";
import { useReducedMotionAfterMount } from "./useReducedMotionAfterMount";
import { FLOOD_S, SPRING_MAGNET } from "./landingMotion";

type Props = ComponentProps<typeof Link> & { href: string; magnetic?: boolean };

/** True for clicks the browser should handle itself (new tab, window, download). */
export function isModifiedClick(e: Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">): boolean {
  return e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

export function LavaFlood() {
  return (
    <motion.div
      aria-hidden="true"
      className="lava-flood pointer-events-none fixed inset-x-0 top-0 z-[100] h-[180vh]"
      initial={{ y: "100vh" }}
      animate={{ y: "-80vh" }}
      transition={{ duration: FLOOD_S, ease: [0.7, 0, 0.84, 0] }}
    />
  );
}

export function LavaLink({ href, magnetic = false, onClick, children, style, ...rest }: Props) {
  const router = useRouter();
  const reduce = useReducedMotionAfterMount();
  const [flooding, setFlooding] = useState(false);
  const ref = useRef<HTMLAnchorElement>(null);
  const x = useSpring(0, SPRING_MAGNET);
  const y = useSpring(0, SPRING_MAGNET);
  // CSS `translate` (not transform), so Tailwind's scale/hover utilities still apply.
  const applyMagnet = () => {
    if (ref.current) ref.current.style.translate = `${x.get().toFixed(2)}px ${y.get().toFixed(2)}px`;
  };
  useMotionValueEvent(x, "change", applyMagnet);
  useMotionValueEvent(y, "change", applyMagnet);

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || reduce || isModifiedClick(e) || flooding) return;
    e.preventDefault();
    setFlooding(true);
    window.setTimeout(() => router.push(href), FLOOD_S * 1000);
  };

  const onMove = (e: PointerEvent<HTMLAnchorElement>) => {
    if (!magnetic || reduce || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * 0.28);
    y.set((e.clientY - (r.top + r.height / 2)) * 0.36);
  };
  const onLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <>
      <Link
        ref={ref}
        href={href}
        onClick={handleClick}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        style={style}
        {...rest}
      >
        {children}
      </Link>
      {flooding && typeof document !== "undefined" && createPortal(<LavaFlood />, document.body)}
    </>
  );
}
