import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { tapLight } from "../lib/haptics";
import { prefersReducedMotion } from "../lib/motion";

const TABS = [
  { label: "Levels", path: "/", icon: MapIcon },
  { label: "Modes", path: "/modes", icon: ModesIcon },
  { label: "Shop", path: "/shop", icon: ShopIcon },
  { label: "Profile", path: "/profile", icon: UserIcon },
] as const;

const TAB_PATHS: ReadonlySet<string> = new Set(TABS.map((t) => t.path));

/**
 * True for a bottom-nav tab root (Levels, Modes, Shop, Profile), taken from TABS so a
 * new tab cannot be missed. The tabs are peers, not a stack: App shows the nav
 * on them, RouteTransition fades them in with no swipe-back, and Android back
 * leaves the app from any of them instead of popping to another tab.
 */
export function isTabRoot(pathname: string): boolean {
  return TAB_PATHS.has(pathname);
}

/**
 * The tab bar's slot in the App column. Leaving a tab for a pushed screen, the
 * bar lifts out of the layout (the screen gets the full height at once) and
 * slides down behind it; coming back, it takes its slot and slides up. It
 * keeps highlighting the tab it was on while it slides away.
 */
export function BottomNavDock({ show }: { show: boolean }) {
  const { pathname } = useLocation();
  const [leaving, setLeaving] = useState(false);
  const [wasShown, setWasShown] = useState(show);
  const lastTab = useRef(pathname);
  if (show) lastTab.current = pathname;

  // Derived state: start the exit on the render that hides the bar.
  if (show !== wasShown) {
    setWasShown(show);
    setLeaving(!show && !prefersReducedMotion());
  }

  useEffect(() => {
    if (!leaving) return;
    // animationend ends it; this covers a WebView backgrounded mid-slide.
    const id = window.setTimeout(() => setLeaving(false), 900);
    return () => window.clearTimeout(id);
  }, [leaving]);

  if (!show && !leaving) return null;
  return (
    <div
      className={show ? "nav-dock nav-dock-in" : "nav-dock nav-dock-out"}
      inert={!show}
      onAnimationEnd={(e) => {
        if (!show && e.target === e.currentTarget) setLeaving(false);
      }}
    >
      <BottomNav activePath={lastTab.current} />
      <style>{`
        .nav-dock-out {
          position: absolute; left: 0; right: 0; bottom: 0; z-index: 20;
          pointer-events: none;
          animation: navDockOut 0.24s cubic-bezier(0.4, 0, 1, 1) both;
        }
        .nav-dock-in { animation: navDockIn 0.36s cubic-bezier(0.2, 0, 0, 1) both; }
        @keyframes navDockOut { to { transform: translate3d(0, 100%, 0); opacity: 0; } }
        @keyframes navDockIn { from { transform: translate3d(0, 100%, 0); opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          .nav-dock-in, .nav-dock-out { animation: none; }
        }
      `}</style>
    </div>
  );
}

export function BottomNav({ activePath }: { activePath?: string } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = activePath ?? location.pathname;

  return (
    <div
      className="px-4 pt-2"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
    >
      <nav
        aria-label="Main navigation"
        className="flex items-stretch justify-around rounded-[28px] border border-white/10 bg-void/70 px-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_40px_-10px_rgba(0,0,0,0.7)] backdrop-blur-2xl backdrop-saturate-150"
      >
        {TABS.map(({ label, path, icon: Icon }) => {
          const active = pathname === path;
          return (
            <button
              key={path}
              onClick={() => {
                void tapLight();
                navigate(path);
              }}
              aria-label={label}
              data-tour={`tab-${label.toLowerCase()}`}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-1 flex-col items-center gap-1.5 pb-3.5 pt-3 transition-[transform,color] active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal rounded-[22px] ${active ? "text-signal" : "text-text-secondary"}`}
            >
              <Icon active={active} />
              <span className="font-mono text-label font-bold uppercase tracking-label">
                {label}
              </span>
              <span
                aria-hidden
                className={`absolute bottom-1.5 h-1 w-14 rounded-full bg-signal shadow-[0_0_12px_rgba(203,242,77,0.7)] transition-opacity duration-200 ${active ? "opacity-100" : "opacity-0"}`}
              />
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function MapIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} fillOpacity={0.25} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </svg>
  );
}

function ShopIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} fillOpacity={0.25} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8Z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </svg>
  );
}

function ModesIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} fillOpacity={0.25} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </svg>
  );
}

function UserIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} fillOpacity={0.25} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a7 7 0 0 1 14 0v1" />
    </svg>
  );
}

