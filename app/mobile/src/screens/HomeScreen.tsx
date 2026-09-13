import { useNavigate } from "react-router-dom";
import { tapLight, tapMedium } from "../lib/haptics";
import { useAuth } from "../contexts/AuthContext";

/**
 * Home = the game title screen. Play-first and hub-centric: a dominant PLAY
 * button drops straight into a fresh random climb (no level select), with the
 * secondary destinations as HUD-style icon buttons. Deliberately NOT a
 * bottom-tab content layout — this reads as a game main menu.
 */
export function HomeScreen() {
  const navigate = useNavigate();
  const { user, isAnonymous } = useAuth();
  const signedIn = Boolean(user) && !isAnonymous;

  const play = () => {
    void tapMedium();
    navigate("/climb");
  };

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-between px-6 pb-10 pt-16 text-center">
      {/* Wordmark */}
      <div className="mt-6 flex flex-col items-center gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.4em] text-text-muted">
          endless climb
        </p>
        <h1 className="font-display text-6xl font-black uppercase leading-none tracking-tight text-text-primary">
          Doom<span className="text-signal">stack</span>
        </h1>
      </div>

      {/* Dominant PLAY */}
      <button
        onClick={play}
        className="group relative mt-4 flex h-40 w-40 items-center justify-center rounded-full border-2 border-signal/70 bg-signal/10 shadow-signal transition-transform active:scale-95"
      >
        <span className="font-display text-2xl font-black uppercase tracking-widest text-signal">
          Play
        </span>
        <span className="absolute inset-0 animate-ping rounded-full border border-signal/30" />
      </button>

      {/* HUD icon row */}
      <nav className="mb-2 flex items-center gap-8">
        <HudButton label="Ranks" onPress={() => { void tapLight(); navigate("/leaderboard"); }}>
          <TrophyIcon />
        </HudButton>
        <HudButton
          label={signedIn ? "Profile" : "Sign in"}
          onPress={() => { void tapLight(); navigate(signedIn ? "/profile" : "/signin"); }}
        >
          <UserIcon />
        </HudButton>
        <HudButton label="Settings" onPress={() => { void tapLight(); navigate(signedIn ? "/settings" : "/signin"); }}>
          <GearIcon />
        </HudButton>
      </nav>
    </main>
  );
}

function HudButton({
  children,
  label,
  onPress,
}: {
  children: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <button
      onClick={onPress}
      className="flex flex-col items-center gap-1.5 text-text-muted transition-transform active:scale-90"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border-strong bg-surface/70">
        {children}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.15em]">
        {label}
      </span>
    </button>
  );
}

function TrophyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a7 7 0 0 1 14 0v1" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}
