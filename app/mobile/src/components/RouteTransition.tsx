import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { tapLight } from "../lib/haptics";
import { prefersReducedMotion } from "../lib/motion";

/**
 * iOS-style navigation feel over the persistent game backdrop.
 *
 * - The hub ("/") is the root — it cross-fades in.
 * - Pushed screens slide in from the right like a UINavigationController push,
 *   and support an *interactive* left-edge swipe-to-go-back: drag from the left
 *   edge and the screen tracks your finger, release past the threshold to pop
 *   (with a light haptic), or let go to snap back. This is the single strongest
 *   "this is a real iPhone app" signal.
 *
 * All motion respects prefers-reduced-motion.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const isHub = pathname === "/";

  // Capture the outgoing screen so it can exit-left while the new one enters.
  const prevRef = useRef<ReactNode>(null);
  const prevPathRef = useRef(pathname);
  const [exiting, setExiting] = useState<ReactNode>(null);

  // Snapshot children just before pathname flips (layout effect fires before paint).
  useLayoutEffect(() => {
    if (prevPathRef.current !== pathname) {
      setExiting(prevRef.current);
      prevPathRef.current = pathname;
      const id = window.setTimeout(() => setExiting(null), 380);
      return () => window.clearTimeout(id);
    }
  }, [pathname]);

  // Always keep ref current with the latest children for next transition snapshot.
  prevRef.current = children;

  if (isHub) {
    return (
      <>
        {exiting && (
          <div key="exit" className="route-exit-left route-overlay">
            {exiting}
          </div>
        )}
        <div key={pathname} className="route-fade">
          {children}
          <TransitionStyles />
        </div>
      </>
    );
  }
  return (
    <>
      {exiting && (
        <div key="exit" className="route-exit-left route-overlay">
          {exiting}
        </div>
      )}
      <PushScreen key={pathname}>{children}</PushScreen>
    </>
  );
}

const EDGE_PX = 28; // how close to the left edge a back-swipe must start
const POP_RATIO = 0.35; // fraction of width to commit the pop
const POP_VELOCITY = 0.55; // px/ms flick shortcut

function PushScreen({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [x, setX] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [engaged, setEngaged] = useState(false);

  const startX = useRef(0);
  const startY = useRef(0);
  const startT = useRef(0);
  const axis = useRef<"none" | "h" | "v">("none");
  // Instantaneous velocity sampled from the most recent move, not the whole
  // gesture average — so a slow-then-flick reads as a flick.
  const lastX = useRef(0);
  const lastT = useRef(0);
  const vel = useRef(0);
  // Track timers so a mid-animation unmount (route change from any other path,
  // or a fast second gesture) can't fire a stale navigate(-1).
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
    if (t.clientX > EDGE_PX) return; // only a true left-edge drag arms the gesture
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
      // Lock the axis on first meaningful movement so we never hijack a
      // vertical scroll that happens to begin near the edge.
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
    // Flick shortcut needs a real displacement so a jittery tap can't pop.
    const flick = vel.current > POP_VELOCITY && x > 40;
    const shouldPop = x > width * POP_RATIO || flick;
    const reduce = prefersReducedMotion();

    const goBack = () => {
      void tapLight();
      // Match the visible back control: never leave the user on a bare backdrop
      // if this screen has no history entry behind it (auth replace, deep link).
      if (window.history.length > 1) navigate(-1);
      else navigate("/");
    };

    if (reduce) {
      // No slide for reduced-motion users — resolve immediately.
      if (shouldPop) goBack();
      else {
        setX(0);
        setEngaged(false);
      }
      return;
    }

    setAnimating(true);
    if (shouldPop) {
      setX(width);
      later(goBack, 210);
    } else {
      setX(0);
      later(() => {
        setAnimating(false);
        setEngaged(false);
      }, 260);
    }
  };

  const dragging = engaged && !animating;
  const style = engaged
    ? {
        transform: `translate3d(${x}px, 0, 0)`,
        transition: animating
          ? "transform 0.24s cubic-bezier(0.16, 1, 0.3, 1)"
          : "none",
        boxShadow: x > 0 ? "-18px 0 55px -12px rgba(0,0,0,0.6)" : undefined,
      }
    : undefined;

  return (
    <div
      className={engaged ? "route-push-live" : "route-push"}
      style={style}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={endGesture}
      onTouchCancel={endGesture}
    >
      {/* Hint of the finger being able to grab from the edge while dragging. */}
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
      .route-fade { animation: routeFade 0.32s ease-out both; }
      .route-push { animation: routePush 0.38s cubic-bezier(0.16, 1, 0.3, 1) both; }
      /* While a live drag owns the transform, don't run the entrance keyframe. */
      .route-push-live { will-change: transform; }
      /* Outgoing screen exits left as the new one enters — canvas feel. */
      .route-overlay {
        position: fixed; inset: 0; z-index: 9;
        pointer-events: none;
      }
      .route-exit-left {
        animation: routeExitLeft 0.38s cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      @keyframes routeFade {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes routePush {
        from { transform: translate3d(100%, 0, 0); box-shadow: -22px 0 60px -8px rgba(0,0,0,0.55); }
        to   { transform: translate3d(0, 0, 0); }
      }
      @keyframes routeExitLeft {
        from { transform: translate3d(0, 0, 0); opacity: 1; }
        to   { transform: translate3d(-28%, 0, 0); opacity: 0; }
      }
      @media (prefers-reduced-motion: reduce) {
        .route-fade, .route-push, .route-exit-left { animation: none; }
      }
    `}</style>
  );
}
