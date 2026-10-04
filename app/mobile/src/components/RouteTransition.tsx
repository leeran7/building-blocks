import { useLocation, useNavigationType, type Location, type NavigationType } from "react-router-dom";
import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { tapLight } from "../lib/haptics";
import { prefersReducedMotion } from "../lib/motion";
import { parentRoute, useBackOr } from "../lib/navigation";
import { isTabRoot } from "./BottomNav";

/**
 * How one screen hands over to the next, over the persistent game backdrop.
 *
 * Screens are transparent (the lava backdrop shows through), so the outgoing
 * screen stays mounted for the length of the transition and both animate
 * together. Unmounting it at once, as this used to, left a frame of bare
 * backdrop before the next screen arrived.
 *
 * - tab: between two bottom-nav tabs (peers, not a stack). The old tab fades
 *   out fast while the new one fades in with a small settle.
 * - push: hub → screen (Shop → Skin Details, Profile → Settings). Shared-axis
 *   slide: the old screen drifts left and fades out early, the new one comes
 *   in from the right and fades in, so the two never sit on top of each other
 *   at full strength.
 * - pop: the same in reverse (Back, Android back, a swipe from the left edge).
 *   After a swipe the screen is already off to the right, so only the screen
 *   underneath animates in.
 *
 * All motion respects prefers-reduced-motion: screens swap with no animation.
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

/** Set by a swipe-back just before it navigates: that screen has already left. */
let swipedAway: string | null = null;

interface Layer {
  id: number;
  location: Location;
}

interface Scenes {
  current: Layer;
  exiting: Layer | null;
  kind: TransitionKind;
  nextId: number;
}

export function RouteTransition({ children }: { children: (location: Location) => ReactNode }) {
  const location = useLocation();
  const navType = useNavigationType();
  const [scenes, setScenes] = useState<Scenes>(() => ({
    current: { id: 0, location },
    exiting: null,
    kind: "initial",
    nextId: 1,
  }));

  // Adopt a new location during render (React's derived-state pattern), so the
  // first frame of the new screen already has the old one beside it.
  let shown = scenes;
  if (scenes.current.location.key !== location.key) {
    const from = scenes.current.location.pathname;
    if (from === location.pathname) {
      // Same screen, new entry (a tab tapped twice): no transition, no remount.
      shown = { ...scenes, current: { ...scenes.current, location } };
    } else {
      const skipExit = prefersReducedMotion() || swipedAway === from;
      shown = {
        current: { id: scenes.nextId, location },
        exiting: skipExit ? null : scenes.current,
        kind: transitionKind(from, location.pathname, navType),
        nextId: scenes.nextId + 1,
      };
    }
    setScenes(shown);
  }

  useEffect(() => {
    swipedAway = null;
  }, [location.key]);

  const exitingId = shown.exiting?.id;
  const finishExit = (id: number) =>
    setScenes((s) => (s.exiting?.id === id ? { ...s, exiting: null } : s));

  const layers: Array<{ layer: Layer; role: "enter" | "exit" }> = [];
  if (shown.exiting) layers.push({ layer: shown.exiting, role: "exit" });
  layers.push({ layer: shown.current, role: "enter" });

  return (
    <div className="route-stage">
      {layers.map(({ layer, role }) => (
        <Scene
          key={layer.id}
          pathname={layer.location.pathname}
          role={role}
          kind={shown.kind}
          onExited={role === "exit" && exitingId !== undefined ? () => finishExit(exitingId) : undefined}
        >
          {children(layer.location)}
        </Scene>
      ))}
      <TransitionStyles />
    </div>
  );
}

const EDGE_PX = 28;
const POP_RATIO = 0.35;
const POP_VELOCITY = 0.55;
/** Checks that a missed animationend can't strand the outgoing screen. */
const EXIT_SAFETY_MS = 900;

/**
 * One screen in the stage. The same component plays the entering and the
 * exiting role so React keeps the screen mounted when it changes role. Pushed
 * screens (not tab roots) also take the swipe-back gesture from the left edge.
 */
function Scene({
  pathname,
  role,
  kind,
  onExited,
  children,
}: {
  pathname: string;
  role: "enter" | "exit";
  kind: TransitionKind;
  onExited?: () => void;
  children: ReactNode;
}) {
  const swipeable = role === "enter" && !isTabRoot(pathname);
  // A deep-linked screen has nothing behind it: swipe to its parent instead.
  const back = useBackOr(parentRoute(pathname));
  const ref = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [animKind, setAnimKind] = useState<"pop" | "snap" | null>(null);
  const [engaged, setEngaged] = useState(false);

  const startX = useRef(0);
  const startY = useRef(0);
  const startT = useRef(0);
  const axis = useRef<"none" | "h" | "v">("none");
  const lastX = useRef(0);
  const lastT = useRef(0);
  const vel = useRef(0);
  const timers = useRef<number[]>([]);
  useEffect(
    () => () => {
      timers.current.forEach((id) => window.clearTimeout(id));
    },
    [],
  );
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  };

  // animationend removes the outgoing screen. In case it never fires (the
  // WebView was backgrounded mid-transition), drop it once nothing is running.
  const exitedRef = useRef(onExited);
  exitedRef.current = onExited;
  const exiting = role === "exit";
  useEffect(() => {
    if (!exiting) return;
    let id = 0;
    const check = () => {
      const running = ref.current?.getAnimations?.().some((a) => a.playState === "running") ?? false;
      if (running) id = window.setTimeout(check, EXIT_SAFETY_MS);
      else exitedRef.current?.();
    };
    id = window.setTimeout(check, EXIT_SAFETY_MS);
    return () => window.clearTimeout(id);
  }, [exiting]);

  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (!swipeable || animating) return;
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
    if (animating || startT.current === 0) return;
    const t = e.touches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    if (axis.current === "none") {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      axis.current = Math.abs(dx) > Math.abs(dy) && dx > 0 ? "h" : "v";
      if (axis.current === "h") setEngaged(true);
    }
    if (axis.current === "h") {
      const clamped = Math.max(0, dx);
      const now = Date.now();
      const gap = now - lastT.current;
      if (gap > 0) vel.current = (clamped - lastX.current) / gap;
      lastX.current = clamped;
      lastT.current = now;
      setX(clamped);
    }
  };

  const endGesture = () => {
    if (startT.current === 0) return;
    const wasHorizontal = axis.current === "h";
    startT.current = 0;
    if (!wasHorizontal) return;
    const width = window.innerWidth || 1;
    const flick = vel.current > POP_VELOCITY && x > 40;
    const shouldPop = x > width * POP_RATIO || flick;
    const reduce = prefersReducedMotion();

    const goBack = () => {
      void tapLight();
      swipedAway = pathname;
      back();
    };

    if (reduce) {
      if (shouldPop) goBack();
      else {
        setX(0);
        setEngaged(false);
      }
      return;
    }

    setAnimating(true);
    if (shouldPop) {
      setAnimKind("pop");
      setX(width);
      later(goBack, 220);
    } else {
      // Spring snap-back — overshoot signals the screen resisted dismissal.
      setAnimKind("snap");
      setX(0);
      later(() => {
        setAnimating(false);
        setEngaged(false);
        setAnimKind(null);
      }, 360);
    }
  };

  const dragging = engaged && !animating;
  const style = engaged
    ? {
        transform: `translate3d(${x}px, 0, 0)`,
        transition: animating
          ? animKind === "snap"
            ? "transform 0.36s cubic-bezier(0.34, 1.56, 0.64, 1)"
            : "transform 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94)"
          : "none",
      }
    : undefined;

  return (
    <div
      ref={ref}
      className={`route-scene ${engaged ? "route-live" : `route-${role}-${kind}`}`}
      style={style}
      inert={exiting}
      aria-hidden={exiting || undefined}
      data-route-role={role}
      onAnimationEnd={(e) => {
        if (exiting && e.target === e.currentTarget) onExited?.();
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={endGesture}
      onTouchCancel={endGesture}
    >
      {dragging && x > 0 && (
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
    </div>
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
      /* Live drag: the gesture owns transform, entrance keyframes suppressed. */
      .route-live { will-change: transform; }

      /* Shared axis: the leaving screen fades out in the first third, the
         arriving one fades in after it while it decelerates into place, so the
         two never show at full strength on top of each other. */
      .route-enter-initial,
      .route-enter-tab  { animation: routeSettle 0.32s cubic-bezier(0.2, 0, 0, 1) both, routeFadeIn 0.22s linear 0.06s both; }
      .route-exit-tab   { animation: routeFadeOut 0.1s linear both; }
      .route-enter-push { animation: routeFromRight 0.38s cubic-bezier(0.2, 0, 0, 1) both, routeFadeIn 0.22s linear 0.08s both; }
      .route-exit-push  { animation: routeToLeft 0.12s cubic-bezier(0.4, 0, 1, 1) both; }
      .route-enter-pop  { animation: routeFromLeft 0.38s cubic-bezier(0.2, 0, 0, 1) both, routeFadeIn 0.22s linear 0.08s both; }
      .route-exit-pop   { animation: routeToRight 0.12s cubic-bezier(0.4, 0, 1, 1) both; }

      @keyframes routeFadeIn    { from { opacity: 0; } to { opacity: 1; } }
      @keyframes routeFadeOut   { to { opacity: 0; } }
      @keyframes routeSettle    { from { transform: translate3d(0, 8px, 0) scale(0.985); } to { transform: none; } }
      @keyframes routeFromRight { from { transform: translate3d(56px, 0, 0); } to { transform: none; } }
      @keyframes routeFromLeft  { from { transform: translate3d(-40px, 0, 0); } to { transform: none; } }
      @keyframes routeToLeft    { to { opacity: 0; transform: translate3d(-24px, 0, 0); } }
      @keyframes routeToRight   { to { opacity: 0; transform: translate3d(32px, 0, 0); } }
      @media (prefers-reduced-motion: reduce) {
        .route-scene { animation: none !important; }
      }
    `}</style>
  );
}
