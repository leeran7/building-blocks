import { useLocation, useNavigationType, type Location, type NavigationType } from "react-router-dom";
import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
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
import { duration, ease, spring, travel } from "../lib/motionTokens";
import { parentRoute, useBackOr } from "../lib/navigation";
import { isTabRoot } from "./BottomNav";

/**
 * How one screen hands over to the next, over the persistent game backdrop.
 *
 * Screens are transparent (the lava backdrop shows through), so the outgoing
 * screen stays mounted (AnimatePresence) and both animate together:
 *
 * - tab: between two bottom-nav tabs (peers, not a stack). The old tab fades
 *   out fast while the new one fades in and settles up into place.
 * - push: hub → screen (Shop → Skin Details, Profile → Settings). Shared-axis
 *   slide: the old screen drifts left and is gone in the first third, the new
 *   one springs in from the right as it fades up, so the two never show at full
 *   strength on top of each other.
 * - pop: the same in reverse (Back, Android back, a swipe from the left edge).
 *   After a swipe the screen is already off to the right, so it just goes.
 *
 * A LayoutGroup spans both screens, so an element tagged with the same
 * `layoutId` on each (the Shop card's character and Skin Details' preview)
 * travels from one to the other instead of cutting.
 *
 * Reduced motion: screens swap with no movement.
 */
export type TransitionKind = "initial" | "tab" | "push" | "pop";

/** Which transition a move from `from` to `to` gets. Pure, so tests can call it. */
export function transitionKind(from: string, to: string, navType: NavigationType): TransitionKind {
  if (isTabRoot(from) && isTabRoot(to)) return "tab";
  if (navType === "POP") return "pop";
  // Back from a cold-opened screen replaces it with its parent (useBackOr).
  if (navType === "REPLACE" && parentRoute(from) === to) return "pop";
  if (isTabRoot(to) && !isTabRoot(from)) return "pop";
  return "push";
}

/** What the screens animate with for one transition: read by both of them. */
export interface SceneCustom {
  kind: TransitionKind;
  /** The leaving screen was swiped away and is already off screen. */
  swiped: boolean;
  reduce: boolean;
}

const fadeIn = (delay: number) => ({ duration: duration.fast + 0.04, ease: "linear" as const, delay });
const leave = { duration: duration.exit, ease: ease.in };

/** Where a screen starts when it arrives. */
export function sceneEnterFrom({ kind, reduce }: SceneCustom): TargetAndTransition {
  if (reduce) return { opacity: 1, x: 0, y: 0, scale: 1 };
  if (kind === "push") return { opacity: 0, x: travel.screen };
  if (kind === "pop") return { opacity: 0, x: -travel.behind };
  return { opacity: 0, y: 8, scale: 0.985 };
}

/** Where a screen comes to rest, and how it gets there. */
export function sceneRest({ kind, reduce }: SceneCustom): TargetAndTransition {
  const transition = reduce
    ? { duration: 0 }
    : { ...spring.smooth, opacity: fadeIn(kind === "push" || kind === "pop" ? 0.08 : 0.06) };
  return { opacity: 1, x: 0, y: 0, scale: 1, transition };
}

/** Where a screen goes when it leaves. */
export function sceneExitTo({ kind, swiped, reduce }: SceneCustom): TargetAndTransition {
  if (reduce || swiped) return { opacity: 0, transition: { duration: 0 } };
  if (kind === "push") return { opacity: 0, x: -24, transition: leave };
  if (kind === "pop") return { opacity: 0, x: 32, transition: leave };
  return { opacity: 0, transition: { duration: duration.exit * 0.7, ease: "linear" } };
}

const SCENE_VARIANTS = { enter: sceneEnterFrom, rest: sceneRest, exit: sceneExitTo };

/** Set by a swipe-back just before it navigates: that screen has already left. */
let swipedAway: string | null = null;

interface SceneState {
  id: number;
  pathname: string;
  key: string;
  kind: TransitionKind;
  swiped: boolean;
}

export function RouteTransition({ children }: { children: (location: Location) => ReactNode }) {
  const location = useLocation();
  const navType = useNavigationType();
  const [scene, setScene] = useState<SceneState>(() => ({
    id: 0,
    pathname: location.pathname,
    key: location.key,
    kind: "initial",
    swiped: false,
  }));

  // Adopt a new location during render (React's derived-state pattern), so the
  // first frame of the new screen already has the old one leaving beside it.
  let shown = scene;
  if (scene.key !== location.key) {
    shown =
      scene.pathname === location.pathname
        ? // Same screen, new entry (a tab tapped twice): no transition, no remount.
          { ...scene, key: location.key }
        : {
            id: scene.id + 1,
            pathname: location.pathname,
            key: location.key,
            kind: transitionKind(scene.pathname, location.pathname, navType),
            swiped: swipedAway === scene.pathname,
          };
    setScene(shown);
  }

  useEffect(() => {
    swipedAway = null;
  }, [location.key]);

  const custom: SceneCustom = { kind: shown.kind, swiped: shown.swiped, reduce: prefersReducedMotion() };

  return (
    <div className="route-stage">
      <LayoutGroup>
        <AnimatePresence custom={custom}>
          <Scene key={shown.id} pathname={shown.pathname} custom={custom}>
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

/**
 * One screen in the stage. While it is the current screen, pushed screens (not
 * tab roots) take the swipe-back gesture from the left edge; once it starts
 * leaving it is inert and hidden from assistive tech.
 */
function Scene({ pathname, custom, children }: { pathname: string; custom: SceneCustom; children: ReactNode }) {
  const present = useIsPresent();
  // A leaving screen keeps the props it last rendered with; the transition it
  // leaves by comes from AnimatePresence's custom.
  const leavingAs = usePresenceData() as SceneCustom | undefined;
  const kind = present ? custom.kind : (leavingAs?.kind ?? custom.kind);
  const swipeable = present && !isTabRoot(pathname);
  // A deep-linked screen has nothing behind it: swipe to its parent instead.
  const back = useBackOr(parentRoute(pathname));
  // The gesture and the transition share one x, so a release carries on from
  // wherever the finger let go.
  const x = useMotionValue(0);
  const [dragging, setDragging] = useState(false);

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
  // Leaving: a pending swipe step (the delayed back) must not also run, or
  // Back pressed mid-swipe would step back twice.
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
    if (!swipeable || settling.current) return;
    const t = e.touches[0];
    if (t.clientX > EDGE_PX) return;
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
    const t = e.touches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    if (axis.current === "none") {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      axis.current = Math.abs(dx) > Math.abs(dy) && dx > 0 ? "h" : "v";
      if (axis.current === "h") setDragging(true);
    }
    if (axis.current === "h") {
      const clamped = Math.max(0, dx);
      const now = Date.now();
      const gap = now - lastT.current;
      if (gap > 0) vel.current = (clamped - lastX.current) / gap;
      lastX.current = clamped;
      lastT.current = now;
      x.set(clamped);
    }
  };

  const endGesture = () => {
    if (startT.current === 0) return;
    const wasHorizontal = axis.current === "h";
    startT.current = 0;
    if (!wasHorizontal) return;
    setDragging(false);
    const width = window.innerWidth || 1;
    const dragged = lastX.current;
    const flick = vel.current > POP_VELOCITY && dragged > 40;
    const shouldPop = dragged > width * POP_RATIO || flick;

    const goBack = () => {
      void tapLight();
      swipedAway = pathname;
      back();
    };

    if (prefersReducedMotion()) {
      if (shouldPop) goBack();
      else x.set(0);
      return;
    }

    settling.current = true;
    if (shouldPop) {
      // Carry the finger's speed (px/ms → px/s) into the slide off screen.
      void animate(x, width, { ...spring.smooth, velocity: vel.current * 1000 });
      later(goBack, 220);
    } else {
      // Spring back: the overshoot says the screen resisted dismissal.
      void animate(x, 0, spring.bouncy);
      later(() => {
        settling.current = false;
      }, 360);
    }
  };

  return (
    <motion.div
      className="route-scene"
      custom={custom}
      variants={SCENE_VARIANTS}
      initial="enter"
      animate="rest"
      exit="exit"
      style={{ x }}
      inert={!present}
      aria-hidden={!present || undefined}
      data-route-role={present ? "enter" : "exit"}
      data-route-kind={kind}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={endGesture}
      onTouchCancel={endGesture}
    >
      {dragging && present && (
        <span
          aria-hidden
          className="pointer-events-none fixed inset-y-0 left-0 z-50 w-1"
          style={{
            background:
              "linear-gradient(to right, color-mix(in srgb, var(--color-signal) 25%, transparent), transparent)",
          }}
        />
      )}
      {children}
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
