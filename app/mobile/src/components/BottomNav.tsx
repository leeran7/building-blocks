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
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-1 flex-col items-center gap-1.5 pb-3.5 pt-3 transition-[transform,color] active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal rounded-[22px] ${active ? "text-signal" : "text-text-secondary"}`}
            >
              <Icon active={active} />
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]">
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

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" stroke={active ? "var(--color-void)" : "currentColor"} fill="none" />
    </svg>
  );
}

function TrophyIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} fillOpacity={0.25} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
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

