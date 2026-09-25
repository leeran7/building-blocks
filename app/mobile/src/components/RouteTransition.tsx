import { useLocation } from "react-router-dom";
import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { tapLight } from "../lib/haptics";
import { prefersReducedMotion } from "../lib/motion";
import { parentRoute, useBackOr } from "../lib/navigation";

/**
 * iOS-style navigation feel over the persistent game backdrop.
 *
 * Push (hub → screen):
 *   - Entering screen slides in from right, on top of the static hub.
 *   - Hub unmounts cleanly once the push finishes. No overlay needed —
 *     the animated backdrop is always visible underneath, so there's no
 *     jarring blank gap. Two things moving in opposite directions felt chaotic.
 *
 * Pop (screen → hub):
 *   - Swipe gesture: PushScreen tracks touch, screen exits right on release.
 *   - Tap back button: pushed screen unmounts, hub fades in.
 *
 * All motion respects prefers-reduced-motion.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const isHub = pathname === "/";

  if (isHub) {
    return (
      <div key={pathname} className="route-fade route-scene">
        {children}
        <TransitionStyles />
      </div>
    );
  }
  return (
    <PushScreen key={pathname} pathname={pathname}>
      {children}
    </PushScreen>
  );
}

const EDGE_PX = 28;
const POP_RATIO = 0.35;
const POP_VELOCITY = 0.55;

function PushScreen({ pathname, children }: { pathname: string; children: ReactNode }) {
  // A deep-linked screen has nothing behind it: swipe to its parent instead.
  const back = useBackOr(parentRoute(pathname));
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

  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (animating) return;
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
      className={`route-scene ${engaged ? "route-push-live" : "route-push"}`}
      style={style}
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
      <TransitionStyles />
    </div>
  );
}

function TransitionStyles() {
  return (
    <style>{`
      /* Stacking: scene sits at z:1 so the exiting hub overlay (z:0) is underneath.
         The incoming screen slides on TOP of the outgoing hub — iOS native depth.
         height:100% propagates the App's flex-1 bound down to each screen's
         h-full main so ScreenBody's overflow-y-auto has a height to scroll in. */
      .route-scene   { position: relative; z-index: 1; height: 100%; }
      .route-overlay { position: fixed; inset: 0; z-index: 0; pointer-events: none; }

      /* Hub: fades in with a 6px settle — the screen lands, not just appears. */
      .route-fade { animation: routeFade 0.28s ease-out both; }
      /* Push: Apple UIKit standard curve, no overshoot. New screen on top. */
      .route-push { animation: routePush 0.32s cubic-bezier(0.25, 0.46, 0.45, 0.94) both; }
      /* Live drag: gesture owns transform, entrance keyframe suppressed. */
      .route-push-live { will-change: transform; }

      /* Hub exit: slight leftward drift + dim, under the arriving screen. */
      .route-exit-left { animation: routeExitLeft 0.28s cubic-bezier(0.55, 0, 1, 0.45) both; }

      @keyframes routeFade {
        from { opacity: 0; transform: translate3d(0, 6px, 0); }
        to   { opacity: 1; transform: translate3d(0, 0, 0);   }
      }
      @keyframes routePush {
        from { transform: translate3d(100%, 0, 0); opacity: 0.94; }
        to   { transform: translate3d(0, 0, 0);    opacity: 1;    }
      }
      @keyframes routeExitLeft {
        from { transform: translate3d(0, 0, 0);    opacity: 1;    }
        to   { transform: translate3d(-18%, 0, 0); opacity: 0.4;  }
      }
      @media (prefers-reduced-motion: reduce) {
        .route-fade, .route-push, .route-exit-left { animation: none; }
      }
    `}</style>
  );
}
