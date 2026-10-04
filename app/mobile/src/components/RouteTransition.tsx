import { useLocation, useNavigate, useNavigationType, type Location, type NavigationType } from "react-router-dom";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import {
  AnimatePresence,
  LayoutGroup,
  animate,
  motion,
  useIsPresent,
  useMotionValue,
  usePresenceData,
  type TargetAndTransition,
} from "motion/react";
import { tapLight } from "../lib/haptics";
import { prefersReducedMotion } from "../lib/motion";
import { duration, ease, spring, travel, zoom } from "../lib/motionTokens";
import { isGameRoute, parentRoute, useBackOr } from "../lib/navigation";
import { adjacentTab, isTabRoot, tabDirection } from "./BottomNav";

/**
 * How one screen hands over to the next, over the persistent game backdrop.
 *
 * Screens are transparent (the lava backdrop shows through), so the outgoing
 * screen stays mounted (AnimatePresence) and both animate together:
 *
 * - tab: between two bottom-nav tabs, laid out left to right in the bar's
 *   order. The new tab slides in from its side as the old one drifts the other
 *   way, whether a tab was tapped or the screen swiped sideways: a tab follows
 *   the finger and, let go past a third of the way (or flicked), carries on
 *   off the edge at the finger's speed as the neighbour slides in.
 * - push: hub → screen (Shop → Skin Details, Profile → Settings). Shared-axis
 *   slide: the old screen drifts left and is gone in the first third, the new
 *   one springs in from the right as it fades up, so the two never show at full
 *   strength on top of each other.
 * - hero: Shop → Skin Details. The tapped card's figure flies up into the
 *   preview (a shared layoutId), so the new screen holds still and lets its
 *   content rise in around it while the Shop fades away.
 * - pop: the same in reverse (Back, Android back, a swipe from the left edge).
 *   A swiped screen steps back the moment the finger lets go and carries on
 *   off the right edge at the finger's speed, while the screen behind arrives
 *   under it at once: no gap of bare backdrop between the two.
 * - launch: into a full-screen run (Endless, a level, a duel, the training).
 *   The depth axis: the screen behind sinks back and fades as the run zooms up
 *   into place from just past the glass.
 * - land: out of a run, the same in reverse: the run lifts away toward the
 *   player and the screen behind rises back into place.
 *
 * A LayoutGroup spans both screens, so an element tagged with the same
 * `layoutId` on each (the Shop card's character and Skin Details' preview)
 * travels from one to the other instead of cutting.
 *
 * Reduced motion: screens swap with no movement.
 */
export type TransitionKind = "initial" | "tab" | "push" | "hero" | "pop" | "launch" | "land";

/** Which transition a move from `from` to `to` gets. Pure, so tests can call it. */
export function transitionKind(from: string, to: string, navType: NavigationType): TransitionKind {
  // Runs move on the depth axis whichever way the history went.
  if (isGameRoute(to)) return "launch";
  if (isGameRoute(from)) return "land";
  if (isTabRoot(from) && isTabRoot(to)) return "tab";
  if (navType === "POP") return "pop";
  if (from === "/shop" && to.startsWith("/shop/")) return "hero";
  // Back from a cold-opened screen replaces it with its parent (useBackOr).
  if (navType === "REPLACE" && parentRoute(from) === to) return "pop";
  if (isTabRoot(to) && !isTabRoot(from)) return "pop";
  return "push";
}

/** What the screens animate with for one transition: read by both of them. */
export interface SceneCustom {
  kind: TransitionKind;
  /** Which side the arriving screen comes from: 1 the right, -1 the left. */
  from: 1 | -1;
  /** The leaving screen was swiped away: it carries on off the far edge. */
  swiped: boolean;
  /** How fast the finger let go of a swiped screen, px/s, signed (0 otherwise). */
  swipeVelocity: number;
  reduce: boolean;
}

const fadeIn = (delay: number) => ({ duration: duration.fast + 0.04, ease: "linear" as const, delay });
const leave = { duration: duration.exit, ease: ease.in };

/** Where a screen starts when it arrives. */
export function sceneEnterFrom({ kind, from, reduce }: SceneCustom): TargetAndTransition {
  if (reduce) return { opacity: 1, x: 0, y: 0, scale: 1 };
  if (kind === "push") return { opacity: 0, x: travel.screen };
  if (kind === "tab") return { opacity: 0, x: from * travel.screen };
  // Hold still: the shared figure is the motion, and must not fade or slide.
  if (kind === "hero") return { opacity: 1, x: 0 };
  if (kind === "pop") return { opacity: 0, x: -travel.behind };
  if (kind === "launch") return { opacity: 0, scale: zoom.near };
  if (kind === "land") return { opacity: 0, scale: zoom.far };
  return { opacity: 0, y: 8, scale: 0.985 };
}

/** Where a screen comes to rest, and how it gets there. */
export function sceneRest({ kind, swiped, reduce }: SceneCustom): TargetAndTransition {
  // Behind a swiped screen there is no wait: it is already part way off.
  const delay = swiped ? 0 : kind === "push" || kind === "pop" || kind === "tab" || kind === "launch" ? 0.08 : 0.06;
  const transition = reduce ? { duration: 0 } : { ...spring.smooth, opacity: fadeIn(delay) };
  return { opacity: 1, x: 0, y: 0, scale: 1, transition };
}

/** Where a screen goes when it leaves. */
export function sceneExitTo({ kind, from, swiped, swipeVelocity, reduce }: SceneCustom): TargetAndTransition {
  if (reduce) return { opacity: 0, transition: { duration: 0 } };
  // The finger took it part of the way; it carries on off the far edge at that speed.
  if (swiped) return { x: -from * window.innerWidth, transition: { ...spring.smooth, velocity: swipeVelocity } };
  if (kind === "push") return { opacity: 0, x: -24, transition: leave };
  if (kind === "tab") return { opacity: 0, x: -from * 24, transition: leave };
  if (kind === "hero") return { opacity: 0, transition: { duration: duration.exit * 0.7, ease: ease.in } };
  if (kind === "pop") return { opacity: 0, x: 32, transition: leave };
  // The screen behind a run sinks away; a finished run lifts off toward the player.
  if (kind === "launch") return { opacity: 0, scale: zoom.far, transition: { duration: duration.fast, ease: ease.in } };
  if (kind === "land") return { opacity: 0, scale: zoom.near, transition: leave };
  return { opacity: 0, transition: { duration: duration.exit * 0.7, ease: "linear" } };
}

/** The scene variants, for anything that swaps pages on the same axes (PageSwap). */
export const SCENE_VARIANTS = { enter: sceneEnterFrom, rest: sceneRest, exit: sceneExitTo };

/** Set by a swipe as it navigates: that screen is leaving at this speed (px/s, signed). */
let swipedAway: { pathname: string; velocity: number } | null = null;

interface SceneState {
  id: number;
  pathname: string;
  key: string;
  kind: TransitionKind;
  from: 1 | -1;
  swiped: boolean;
  swipeVelocity: number;
}

/** The transition the screen around a component arrived by: "pop" when the user came back to it. */
export const SceneContext = createContext<TransitionKind>("initial");

export function useSceneKind(): TransitionKind {
  return useContext(SceneContext);
}

/** The scene a move to `location` starts. */
function nextScene(
  scene: SceneState,
  location: Location,
  navType: NavigationType,
  swipe: { velocity: number } | null,
): SceneState {
  const kind = transitionKind(scene.pathname, location.pathname, navType);
  return {
    id: scene.id + 1,
    pathname: location.pathname,
    key: location.key,
    kind,
    from: kind === "tab" ? tabDirection(scene.pathname, location.pathname) : kind === "pop" ? -1 : 1,
    swiped: swipe !== null,
    swipeVelocity: swipe?.velocity ?? 0,
  };
}

/**
 * `tabSwipe`: a sideways swipe on a tab root moves to the tab beside it. Only
 * where the tab bar is (the signed-in app), so a guest's home never swipes to
 * a Shop it does not have.
 */
export function RouteTransition({
  children,
  tabSwipe = false,
}: {
  children: (location: Location) => ReactNode;
  tabSwipe?: boolean;
}) {
  const location = useLocation();
  const navType = useNavigationType();
  const [scene, setScene] = useState<SceneState>(() => ({
    id: 0,
    pathname: location.pathname,
    key: location.key,
    kind: "initial",
    from: 1,
    swiped: false,
    swipeVelocity: 0,
  }));

  // Adopt a new location during render (React's derived-state pattern), so the
  // first frame of the new screen already has the old one leaving beside it.
  let shown = scene;
  if (scene.key !== location.key) {
    const swipe = swipedAway !== null && swipedAway.pathname === scene.pathname ? swipedAway : null;
    shown =
      scene.pathname === location.pathname
        ? // Same screen, new entry (a tab tapped twice): no transition, no remount.
          { ...scene, key: location.key }
        : nextScene(scene, location, navType, swipe);
    setScene(shown);
  }

  useEffect(() => {
    swipedAway = null;
  }, [location.key]);

  const custom: SceneCustom = {
    kind: shown.kind,
    from: shown.from,
    swiped: shown.swiped,
    swipeVelocity: shown.swipeVelocity,
    reduce: prefersReducedMotion(),
  };

  return (
    <div className="route-stage">
      <LayoutGroup>
        <AnimatePresence custom={custom}>
          <Scene key={shown.id} pathname={shown.pathname} custom={custom} tabSwipe={tabSwipe}>
            {children(location)}
          </Scene>
        </AnimatePresence>
      </LayoutGroup>
      <TransitionStyles />
    </div>
  );
}

const EDGE_PX = 28;
const POP_RATIO = 0.35;
const POP_VELOCITY = 0.55;
/** How far (of the width) a tab must be dragged to go to its neighbour. */
const TAB_RATIO = 0.3;
/** Past the first or last tab the screen gives a little, then springs back. */
const TAB_RUBBER = 0.3;

/**
 * One screen in the stage. While it is the current screen it follows a
 * sideways finger: pushed screens (not tab roots or runs) take the swipe-back
 * gesture from the left edge, and with `tabSwipe` a tab root can be dragged
 * either way to the tab beside it. Once it starts leaving it is inert and
 * hidden from assistive tech.
 */
function Scene({
  pathname,
  custom,
  tabSwipe,
  children,
}: {
  pathname: string;
  custom: SceneCustom;
  tabSwipe: boolean;
  children: ReactNode;
}) {
  const present = useIsPresent();
  // Gesture handlers read this: a screen that has started leaving must not
  // finish a swipe (it would stop the exit's x animation and strand the
  // screen, or step back a second time).
  const presentRef = useRef(present);
  presentRef.current = present;
  // A leaving screen keeps the props it last rendered with; the transition it
  // leaves by comes from AnimatePresence's custom.
  const leavingAs = usePresenceData() as SceneCustom | undefined;
  const kind = present ? custom.kind : (leavingAs?.kind ?? custom.kind);
  // A run's left edge is game input, never a swipe-back.
  const swipeBack = present && !isTabRoot(pathname) && !isGameRoute(pathname);
  const swipeTabs = present && tabSwipe && isTabRoot(pathname);
  // A deep-linked screen has nothing behind it: swipe to its parent instead.
  const back = useBackOr(parentRoute(pathname));
  const navigate = useNavigate();
  // The gesture and the transition share one x, so a release carries on from
  // wherever the finger let go.
  const x = useMotionValue(0);
  const [dragging, setDragging] = useState(false);

  const mode = useRef<"back" | "tab">("back");
  const startX = useRef(0);
  const startY = useRef(0);
  const startT = useRef(0);
  const axis = useRef<"none" | "h" | "v">("none");
  const lastX = useRef(0);
  const lastT = useRef(0);
  const vel = useRef(0);
  const settling = useRef(false);
  const timers = useRef<number[]>([]);
  useEffect(
    () => () => {
      timers.current.forEach((id) => window.clearTimeout(id));
    },
    [],
  );
  // Leaving: the spring-back's settle timer has nothing left to settle.
  useEffect(() => {
    if (present) return;
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, [present]);
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  };

  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (settling.current) return;
    const t = e.touches[0];
    if (swipeTabs) mode.current = "tab";
    else if (swipeBack && t.clientX <= EDGE_PX) mode.current = "back";
    else return;
    startX.current = t.clientX;
    startY.current = t.clientY;
    startT.current = Date.now();
    lastX.current = 0;
    lastT.current = startT.current;
    vel.current = 0;
    axis.current = "none";
  };

  const onTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (settling.current || startT.current === 0) return;
    if (!presentRef.current) {
      startT.current = 0;
      axis.current = "none";
      return;
    }
    const t = e.touches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    if (axis.current === "none") {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      // A tab's screen scrolls up and down: only a clearly sideways move is a swipe.
      axis.current =
        mode.current === "tab"
          ? Math.abs(dx) > Math.abs(dy) * 1.2
            ? "h"
            : "v"
          : Math.abs(dx) > Math.abs(dy) && dx > 0
            ? "h"
            : "v";
      if (axis.current === "h") {
        // The finger takes over from any entrance spring still running.
        x.stop();
        setDragging(true);
      }
    }
    if (axis.current === "h") {
      const next =
        mode.current === "back"
          ? Math.max(0, dx)
          : adjacentTab(pathname, dx < 0 ? 1 : -1) === null
            ? dx * TAB_RUBBER
            : dx;
      const now = Date.now();
      const gap = now - lastT.current;
      if (gap > 0) vel.current = (next - lastX.current) / gap;
      lastX.current = next;
      lastT.current = now;
      x.set(next);
    }
  };

  const endGesture = () => {
    if (startT.current === 0) return;
    const wasHorizontal = axis.current === "h";
    startT.current = 0;
    axis.current = "none";
    if (!wasHorizontal) return;
    setDragging(false);
    if (!presentRef.current) return;
    const width = window.innerWidth || 1;
    const dragged = lastX.current;
    const reduce = prefersReducedMotion();

    if (mode.current === "tab") {
      const target = adjacentTab(pathname, dragged < 0 ? 1 : -1);
      const flick = Math.abs(vel.current) > POP_VELOCITY && Math.abs(dragged) > 40 && vel.current * dragged > 0;
      if (target !== null && (Math.abs(dragged) > width * TAB_RATIO || flick)) {
        // Go now: this tab carries on off its edge at the finger's speed as
        // the neighbour slides in from the other side (sceneExitTo).
        settling.current = true;
        swipedAway = { pathname, velocity: reduce ? 0 : vel.current * 1000 };
        void tapLight();
        void navigate(target);
        return;
      }
    } else {
      const flick = vel.current > POP_VELOCITY && dragged > 40;
      if (dragged > width * POP_RATIO || flick) {
        // Step back now: the screen behind arrives while this one carries on off
        // the edge at the finger's speed (px/ms → px/s) as its exit (sceneExitTo).
        // Not an animate(x, …) of its own: that would strand the exit.
        settling.current = true;
        swipedAway = { pathname, velocity: reduce ? 0 : Math.max(0, vel.current) * 1000 };
        void tapLight();
        back();
        return;
      }
    }
    if (reduce) {
      x.set(0);
      return;
    }
    // Spring back: the overshoot says the screen resisted.
    settling.current = true;
    void animate(x, 0, spring.bouncy);
    later(() => {
      settling.current = false;
    }, 360);
  };

  return (
    <motion.div
      className="route-scene"
      custom={custom}
      variants={SCENE_VARIANTS}
      initial="enter"
      animate="rest"
      exit="exit"
      // A tab hands sideways moves to the swipe; up and down still scroll.
      style={{ x, touchAction: swipeTabs ? "pan-y" : undefined }}
      inert={!present}
      aria-hidden={!present || undefined}
      data-route-role={present ? "enter" : "exit"}
      data-route-kind={kind}
      data-route-from={present ? custom.from : (leavingAs?.from ?? custom.from)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={endGesture}
      onTouchCancel={endGesture}
    >
      {dragging && present && mode.current === "back" && (
        <span
          aria-hidden
          className="pointer-events-none fixed inset-y-0 left-0 z-50 w-1"
          style={{
            background:
              "linear-gradient(to right, color-mix(in srgb, var(--color-signal) 25%, transparent), transparent)",
          }}
        />
      )}
      <SceneContext.Provider value={kind}>{children}</SceneContext.Provider>
    </motion.div>
  );
}

function TransitionStyles() {
  return (
    <style>{`
      /* Both screens share the stage during a transition. height:100% carries
         the App's flex-1 bound down to each screen's h-full main so
         ScreenBody's overflow-y-auto has a height to scroll in. */
      .route-stage { position: relative; height: 100%; }
      .route-scene { position: absolute; inset: 0; }
      .route-scene[data-route-role="exit"] { pointer-events: none; }
    `}</style>
  );
}
