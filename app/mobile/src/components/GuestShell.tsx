import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { ClimbScreen } from "../screens/ClimbScreen";
import { AnimatedBackdrop } from "./AnimatedBackdrop";
import { LogoMark } from "./LogoMark";
import { tapHeavy, tapLight } from "../lib/haptics";

export function GuestShell({ onSignIn }: { onSignIn: () => void }) {
  const navigate = useNavigate();

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-void">
      <AnimatedBackdrop />
      <div className="relative z-10 flex-1 overflow-hidden">
        <Routes>
          <Route path="/climb" element={<ClimbScreen onSignIn={onSignIn} />} />
          <Route
            path="*"
            element={
              <GuestHome
                onPlay={() => {
                  void tapHeavy();
                  navigate("/climb");
                }}
                onSignIn={() => {
                  void tapLight();
                  onSignIn();
                }}
              />
            }
          />
        </Routes>
      </div>
    </div>
  );
}

function GuestHome({
  onPlay,
  onSignIn,
}: {
  onPlay: () => void;
  onSignIn: () => void;
}) {
  return (
    <main className="flex h-full flex-col pt-[calc(env(safe-area-inset-top)+1rem)]">
      <div className="flex items-center justify-end px-5">
        <button
          onClick={onSignIn}
          className="rounded-full border border-border-strong bg-surface/70 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.15em] text-signal transition-transform active:scale-95"
        >
          Sign In
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-9 px-6 text-center">
        <div className="mt-1 flex flex-col items-center gap-2">
          <LogoMark size={48} card className="mb-1" />
          <span className="font-mono text-[11px] uppercase tracking-[0.5em] text-text-muted">
            endless&nbsp;climb
          </span>
          <h1 className="gh-wordmark font-display text-[2.75rem] font-black uppercase leading-none tracking-tight text-text-primary">
            Doom<span className="text-signal">stack</span>
          </h1>
          <span className="h-px w-16 bg-border-strong" />
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-secondary">
            Your first climb awaits
          </p>
        </div>

        <div className="flex w-full flex-col items-center gap-4">
          <button
            onClick={onPlay}
            aria-label="Play"
            className="flex w-full items-center gap-4 rounded-2xl bg-signal px-5 py-5 text-left text-void shadow-signal transition-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-void/15">
              <PlayGlyph />
            </span>
            <span className="flex-1">
              <span className="block font-display text-2xl font-black uppercase tracking-wide text-void">
                Play
              </span>
              <span className="block font-mono text-[11px] uppercase tracking-[0.06em] text-void/70">
                Endless quick climb
              </span>
            </span>
            <ChevronRight />
          </button>

          <p className="max-w-[260px] text-xs leading-relaxed text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
            Sign in to add friends, challenge them to 1v1 races, climb the
            leaderboard, and save your progress.
          </p>
        </div>
      </div>

      <style>{`
        .gh-wordmark {
          text-shadow: 0 0 34px rgba(203, 242, 77, 0.14);
        }
      `}</style>
    </main>
  );
}

function PlayGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5.14v13.72a1 1 0 0 0 1.53.85l10.79-6.86a1 1 0 0 0 0-1.7L9.53 4.29A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-void/60" aria-hidden>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
