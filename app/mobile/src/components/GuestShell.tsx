import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { ClimbScreen } from "../screens/ClimbScreen";
import { LevelMapScreen } from "../screens/LevelMapScreen";
import { LevelPlayScreen } from "../screens/LevelPlayScreen";
import { TrainingScreen, type GuestTrainingNext } from "../screens/TrainingScreen";
import { LevelsProvider } from "../contexts/LevelsContext";
import { GUEST_MAP_PATH, GuestProvider } from "../contexts/GuestContext";
import { GUEST_LEVEL_CAP } from "../lib/levels/guestClient";
import { guestOnboarding } from "../lib/onboarding";
import { AnimatedBackdrop } from "./AnimatedBackdrop";
import { LogoLockup } from "./LogoMark";
import { tapHeavy, tapLight } from "../lib/haptics";

/**
 * Guest mode: Endless, the training climb and a levels taster (levels 1 to
 * GUEST_LEVEL_CAP) on the device, with Sign In always one tap away. The
 * taster reuses the account's level screens under a guest LevelsProvider,
 * whose client is device-only: nothing a guest earns reaches the server.
 */
export function GuestShell({ onSignIn }: { onSignIn: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();

  // The first thing a guest starts goes through the training climb first.
  const start = (path: GuestTrainingNext) => {
    if (guestOnboarding.needs(1)) {
      guestOnboarding.markOffered();
      navigate("/tutorial", { state: { then: path } });
      return;
    }
    navigate(path);
  };

  return (
    <GuestProvider onSignIn={onSignIn}>
      <LevelsProvider guest>
        <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-void">
          <AnimatedBackdrop />
          <div className="relative z-10 flex-1 overflow-hidden">
            <Routes>
              <Route path="/climb" element={<ClimbScreen onSignIn={onSignIn} />} />
              <Route path={GUEST_MAP_PATH} element={<LevelMapScreen />} />
              {/* Keyed by entry so "Practice this level" from a result starts fresh. */}
              <Route path={`${GUEST_MAP_PATH}/:level/play`} element={<LevelPlayScreen key={location.key} />} />
              <Route path="/tutorial" element={<TrainingScreen />} />
              <Route
                path="*"
                element={
                  <GuestHome
                    onPlay={() => {
                      void tapHeavy();
                      start("/climb");
                    }}
                    onLevels={() => {
                      void tapHeavy();
                      // The map itself opens the training for a new guest.
                      navigate(GUEST_MAP_PATH);
                    }}
                    onHowToPlay={() => {
                      void tapLight();
                      navigate("/tutorial");
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
      </LevelsProvider>
    </GuestProvider>
  );
}

function GuestHome({
  onPlay,
  onLevels,
  onHowToPlay,
  onSignIn,
}: {
  onPlay: () => void;
  onLevels: () => void;
  onHowToPlay: () => void;
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
          <h1 className="m-0">
            <LogoLockup className="gh-wordmark h-44 w-auto" />
          </h1>
          <span className="font-mono text-[11px] uppercase tracking-[0.5em] text-text-muted">
            guest&nbsp;mode
          </span>
          <span className="h-px w-16 bg-border-strong" />
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-secondary">
            Your first climb awaits
          </p>
        </div>

        <div className="flex w-full flex-col items-center gap-4">
          <button
            onClick={onPlay}
            aria-label="Endless, climb as high as you can"
            className="flex w-full items-center gap-4 rounded-2xl bg-signal px-5 py-5 text-left text-void shadow-signal transition-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-void/15">
              <PlayGlyph />
            </span>
            <span className="flex-1">
              <span className="block font-display text-2xl font-black uppercase tracking-wide text-void">
                Endless
              </span>
              <span className="block font-mono text-[11px] uppercase tracking-[0.06em] text-void/70">
                Climb as high as you can
              </span>
            </span>
            <ChevronRight />
          </button>

          {/* The levels taster (Leeran, 2026-10-04): the rest need an account. */}
          <button
            onClick={onLevels}
            aria-label={`Levels, play levels 1 to ${GUEST_LEVEL_CAP}`}
            className="glass flex w-full items-center gap-4 rounded-2xl border border-white/10 px-5 py-4 text-left transition-transform active:scale-[0.97]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-signal/50 bg-signal/10 text-signal">
              <StarGlyph />
            </span>
            <span className="flex-1">
              <span className="block font-display text-lg font-black uppercase tracking-wide text-text-primary">
                Levels
              </span>
              <span className="block text-meta text-text-secondary">
                Play levels 1–{GUEST_LEVEL_CAP}
              </span>
            </span>
            <ChevronRight className="text-text-muted" />
          </button>

          <p className="max-w-[280px] text-xs leading-relaxed text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
            Sign in to keep your stars, play all 300 levels, add friends,
            race them 1v1 and save your scores to the leaderboard.
          </p>
          <button
            type="button"
            onClick={onHowToPlay}
            className="min-h-[44px] px-4 font-mono text-[11px] uppercase tracking-[0.15em] text-text-secondary underline underline-offset-2 active:text-text-primary"
          >
            How to play
          </button>
        </div>
      </div>

      <style>{`
        .gh-wordmark {
          filter: drop-shadow(0 0 34px rgba(203, 242, 77, 0.14));
        }
      `}</style>
    </main>
  );
}

function StarGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9L12 2.5Z" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5.14v13.72a1 1 0 0 0 1.53.85l10.79-6.86a1 1 0 0 0 0-1.7L9.53 4.29A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}

function ChevronRight({ className = "text-void/60" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
