import type { ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { prefersReducedMotion } from "../lib/motion";
import { SCENE_VARIANTS, type SceneCustom } from "./RouteTransition";

/**
 * A page change inside one screen (Sign In's options and email form, the
 * training's cards): the same shared-axis slide as a pushed screen, so a step
 * forward moves like a push and a step `back` like Back, without a route.
 *
 * Each page fills the swap's box while both are on screen; the leaving one is
 * inert so nothing on it can be pressed mid-slide.
 */
export function PageSwap({ page, back = false, children }: { page: string; back?: boolean; children: ReactNode }) {
  const custom: SceneCustom = { kind: back ? "pop" : "push", swiped: false, swipeVelocity: 0, reduce: prefersReducedMotion() };
  return (
    <div className="relative h-full w-full">
      <AnimatePresence initial={false} custom={custom}>
        <Page key={page} page={page} custom={custom}>
          {children}
        </Page>
      </AnimatePresence>
    </div>
  );
}

function Page({ page, custom, children }: { page: string; custom: SceneCustom; children: ReactNode }) {
  const present = useIsPresent();
  return (
    <motion.div
      className="absolute inset-0"
      custom={custom}
      variants={SCENE_VARIANTS}
      initial="enter"
      animate="rest"
      exit="exit"
      inert={!present}
      aria-hidden={!present || undefined}
      data-page={page}
      data-page-role={present ? "enter" : "exit"}
    >
      {children}
    </motion.div>
  );
}
