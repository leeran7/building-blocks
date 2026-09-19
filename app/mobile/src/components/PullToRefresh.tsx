import { useEffect, useRef, useState, type ReactNode } from "react";
import { tapLight } from "../lib/haptics";

const THRESHOLD = 60;
const MAX_PULL = 120;
const DAMPING = 0.4;
const SPINNER_H = 48;

export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const isPulling = useRef(false);
  const pullYRef = useRef(0);
  const refreshingRef = useRef(false);
  const [displayY, setDisplayY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (el.scrollTop <= 0) {
        startY.current = e.touches[0].clientY;
        isPulling.current = true;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isPulling.current || refreshingRef.current) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0 && el.scrollTop <= 0) {
        e.preventDefault();
        const d = Math.min(delta * DAMPING, MAX_PULL);
        pullYRef.current = d;
        setDisplayY(d);
      } else {
        isPulling.current = false;
        pullYRef.current = 0;
        setDisplayY(0);
      }
    };

    const onTouchEnd = async () => {
      if (!isPulling.current) return;
      isPulling.current = false;
      const py = pullYRef.current;
      if (py >= THRESHOLD && !refreshingRef.current) {
        void tapLight();
        refreshingRef.current = true;
        setRefreshing(true);
        pullYRef.current = 0;
        setDisplayY(0);
        try {
          await onRefreshRef.current();
        } finally {
          refreshingRef.current = false;
          setRefreshing(false);
        }
      } else {
        pullYRef.current = 0;
        setDisplayY(0);
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  const indicatorH = refreshing ? SPINNER_H : displayY;
  const progress = Math.min(displayY / THRESHOLD, 1);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 pb-4"
      style={{
        WebkitOverflowScrolling: "touch",
        overscrollBehavior: "contain",
      }}
    >
      <div
        className="flex items-center justify-center overflow-hidden"
        style={{
          height: indicatorH,
          transition: isPulling.current ? "none" : "height 200ms ease-out",
        }}
      >
        {refreshing ? (
          <RefreshSpinner />
        ) : displayY > 4 ? (
          <PullArrow progress={progress} ready={displayY >= THRESHOLD} />
        ) : null}
      </div>
      {children}
    </div>
  );
}

function RefreshSpinner() {
  return (
    <svg className="h-5 w-5 animate-spin text-signal" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PullArrow({ progress, ready }: { progress: number; ready: boolean }) {
  return (
    <svg
      className="h-5 w-5 transition-colors duration-150"
      style={{
        opacity: Math.max(0.3, progress),
        transform: `rotate(${progress * 180}deg)`,
        color: ready ? "var(--color-signal)" : "var(--color-text-secondary)",
      }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </svg>
  );
}
