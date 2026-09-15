import { useNavigate, useLocation } from "react-router-dom";
import { tapLight } from "../lib/haptics";
import { LogoMark } from "./LogoMark";

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
        className="flex items-center justify-around rounded-[28px] border border-border-subtle bg-surface/85 px-2 py-3 backdrop-blur-sm"
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
              className="flex flex-col items-center gap-1.5 px-4 py-1 transition-transform active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
            >
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${active ? "border-signal/30 bg-signal/15 text-signal" : "border-transparent text-text-secondary"}`}
              >
                <Icon active={active} />
              </span>
              <span
                className={`font-mono text-[9px] uppercase tracking-[0.15em] transition-colors ${active ? "text-signal" : "text-text-secondary"}`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function HomeIcon({ active: _ }: { active: boolean }) {
  return (
    <span aria-hidden="true">
      <LogoMark size={20} />
    </span>
  );
}

function TrophyIcon({ active: _ }: { active: boolean }) {
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

function UserIcon({ active: _ }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a7 7 0 0 1 14 0v1" />
    </svg>
  );
}

