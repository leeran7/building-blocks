import { useNavigate, useLocation } from "react-router-dom";
import { tapLight } from "../lib/haptics";

const TABS = [
  { label: "Home", path: "/", icon: HomeIcon },
  { label: "Ranks", path: "/leaderboard", icon: TrophyIcon },
  { label: "Profile", path: "/profile", icon: UserIcon },
] as const;

export function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <div
      className="px-4 pt-2"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
    >
      <nav
        aria-label="Main navigation"
        className="flex items-center justify-around gap-1 rounded-full border border-white/10 bg-void/55 px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_8px_32px_-8px_rgba(0,0,0,0.55)] backdrop-blur-2xl backdrop-saturate-150"
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
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-1 rounded-full px-5 py-2 transition-[transform,colors] active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void ${active ? "bg-signal/20 text-signal ring-1 ring-inset ring-signal/25" : "text-text-secondary"}`}
            >
              <Icon />
              <span className="font-mono text-[9px] uppercase tracking-[0.15em]">
                {label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a7 7 0 0 1 14 0v1" />
    </svg>
  );
}

