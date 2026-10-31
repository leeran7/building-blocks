import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { createTraining, TRAINING_GOALS, trainingHint } from "@app/game/levels/training";
import { POWER_UP_SPECS } from "@app/game/powerups";
import { ClimbCanvas } from "@app/components/Game/ClimbCanvas";
import { ActivePowerStack } from "@app/components/Game/PowerUpHud";
import { TouchControls, touchControlsInset } from "@app/components/Game/TouchControls";
import { usePowerUpFeedback } from "@app/components/Game/usePowerUpFeedback";
import { useCanvasSize } from "@app/hooks/useCanvasSize";
import { ControlSchemePicker } from "@app/components/ControlSchemePicker";
import { useCoarsePointer } from "@app/hooks/useCoarsePointer";
import { useControlScheme } from "@app/lib/controlScheme";
import { useSafeAreaInsets } from "@app/hooks/useSafeAreaInsets";

import { Button } from "../components/ui";
import { useSettings } from "../contexts/AppDataContext";
import { notifySuccess, tapLight } from "../lib/haptics";
import { useGameHaptics } from "../lib/useGameHaptics";
import { usePracticeLoop } from "../lib/usePracticeLoop";
import { markTutorialsSeen } from "../lib/levels/tutorialSeen";
import { guestOnboarding, markOnboardingDone, TOUR_STATE } from "../lib/onboarding";
import { useGuest } from "../contexts/GuestContext";
import { PageSwap } from "../components/PageSwap";

type Phase = "intro" | "controls" | "train" | "ready";

/** How long the "nice" line for a met goal stays up, ms. */
const PRAISE_MS = 2200;

/**
 * The full tutorial, part one: what the game is, a choice of on-screen
 * controls (touch devices only), then a short climb the player plays
 * themselves on a practice tower (walk, jump, climb a ladder, grab and use a
 * power-up, touch the summit diamond). It ends on the level
 * map, which runs part two: a tour of the map, its readouts and the tabs.
 *
 * Opened from Profile → How to play. A first launch skips it: the map's PLAY
 * starts level 1, whose intro teaches the basics (and offers the touch
 * controls), and the map tour follows the first clear.
 *
 * A guest (GuestShell) marks the guest's own flag, never the account's.
 */
export function TrainingScreen() {
  const navigate = useNavigate();
  const guest = useGuest();
  const [phase, setPhase] = useState<Phase>("intro");
  const touch = useCoarsePointer();

  // Either way out marks the tutorial done, so it is offered once.
  const toTour = useCallback(() => {
    if (guest) guestOnboarding.markDone();
    else markOnboardingDone();
    navigate("/", { replace: true, state: TOUR_STATE });
  }, [navigate, guest]);

  // Each card hands over to the next on the push axis, like a pushed screen.
  return (
    <PageSwap page={phase}>
      {phase === "intro" ? (
        <Intro onStart={() => setPhase(touch ? "controls" : "train")} onSkip={toTour} />
      ) : phase === "controls" ? (
        <PickControls onStart={() => setPhase("train")} onSkip={toTour} />
      ) : phase === "ready" ? (
        <Ready onNext={toTour} />
      ) : (
        <TrainingClimb
          onDone={() => {
            // The level 1 demo shows what training just taught.
            markTutorialsSeen(["basics"]);
            void notifySuccess();
            setPhase("ready");
          }}
          onSkip={toTour}
        />
      )}
    </PageSwap>
  );
}

function Intro({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <Card eyebrow="Welcome to Doomstack" title="Outclimb the lava" onSkip={onSkip} skipLabel="Skip tutorial">
      <ul className="mt-6 flex flex-col gap-3">
        <Point n={1} title="Climb the tower">
          Every level is a tower with a diamond at the top. Lava rises from below, so keep moving up.
        </Point>
        <Point n={2} title="Earn stars">
          Reach the diamond faster for up to three stars. Stars fill chests with boosters.
        </Point>
        <Point n={3} title="Grab power-ups">
          Glowing orbs on the tower give you a boost the moment you touch them.
        </Point>
      </ul>
      <p className="mt-6 text-meta text-text-secondary">First, a quick practice climb. The lava here never rises, so take your time.</p>
      <div className="mt-6">
        <Button autoFocus onPress={onStart}>
          Start training
        </Button>
      </div>
    </Card>
  );
}

/** Touch players choose a layout before their first climb; the picker saves on tap. */
function PickControls({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <Card eyebrow="Before you climb" title="Pick your controls" onSkip={onSkip} skipLabel="Skip tutorial">
      <p className="mt-6 text-meta text-text-secondary">
        Buttons give you ← → to walk, ↑ to climb and a Jump button. The joystick walks and climbs with one thumb. Not
        sure? Switch between them any time during training, or later from the cog while you play.
      </p>
      <div className="mt-4">
        <ControlSchemePicker labelledBy="training-card-title" />
      </div>
      <div className="mt-6">
        <Button autoFocus onPress={onStart}>
          Start training
        </Button>
      </div>
    </Card>
  );
}

function Ready({ onNext }: { onNext: () => void }) {
  return (
    <Card eyebrow="Training complete" title="You’re ready">
      <ul className="mt-6 flex flex-col gap-3">
        <Point n={1} title="Watch the lava">
          In levels the lava rises in surges, then stumbles. Climb hard while it slows down.
        </Point>
        <Point n={2} title="Beat the clock">
          The stars on the goal bar drop off as the par times pass. Reach the diamond to keep them.
        </Point>
        <Point n={3} title="Every orb is different">
          New power-ups get their own short demo the first time a level has them.
        </Point>
      </ul>
      <div className="mt-8">
        <Button autoFocus onPress={onNext}>
          Show me around
        </Button>
      </div>
    </Card>
  );
}

function Card({
  eyebrow,
  title,
  onSkip,
  skipLabel,
  children,
}: {
  eyebrow: string;
  title: string;
  onSkip?: () => void;
  skipLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <main
      aria-labelledby="training-card-title"
      className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-void px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)]"
    >
      <div className="flex min-h-[44px] items-center justify-end">
        {onSkip && (
          <button
            type="button"
            onClick={() => {
              void tapLight();
              onSkip();
            }}
            className="min-h-[44px] rounded-full px-4 font-mono text-label uppercase tracking-label text-text-secondary active:scale-95"
          >
            {skipLabel ?? "Skip"}
          </button>
        )}
      </div>
      <div className="mx-auto my-auto w-full max-w-sm py-6">
        <p className="font-mono text-label font-bold uppercase tracking-eyebrow text-signal">{eyebrow}</p>
        <h1 id="training-card-title" className="mt-2 font-display text-5xl font-black uppercase leading-none tracking-tight text-text-primary">
          {title}
        </h1>
        {children}
      </div>
    </main>
  );
}

function Point({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-2xl border border-white/10 bg-elevated/50 px-3.5 py-3">
      <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-signal font-mono text-[11px] font-bold text-void">
        {n}
      </span>
      <span>
        <span className="block font-display text-meta font-black uppercase tracking-wide text-text-primary">{title}</span>
        <span className="block text-meta text-text-secondary">{children}</span>
      </span>
    </li>
  );
}

/**
 * The practice climb: the player's own input drives the training through the
 * engine, the canvas draws it, and a coach card says what to do next.
 */
function TrainingClimb({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const training = useMemo(() => createTraining(), []);
  const { view, feed, setTouch } = usePracticeLoop(training);
  const touch = useCoarsePointer();
  const [scheme, setScheme] = useControlScheme();
  const otherScheme = scheme === "joystick" ? "buttons" : "joystick";

  const boxRef = useRef<HTMLDivElement>(null);
  const size = useCanvasSize(boxRef, { fill: true });
  const safeArea = useSafeAreaInsets();
  const bottomInset = touchControlsInset(safeArea.bottom);
  const myAvatarId = useSettings().data?.avatarId ?? null;
  const simRef = useMemo(() => ({ current: training.state }), [training]);
  useGameHaptics(simRef, 0, 0);

  const player = training.state.players[0];
  // Sound needs a gesture to start on iOS: the first touch on the climb.
  const { unlockAudio } = usePowerUpFeedback(view.done ? undefined : player, view.tick, 0);

  // A met goal: a haptic, and its one-line takeaway under the next goal.
  const [praise, setPraise] = useState<{ title: string; text: string } | null>(null);
  const shownGoal = useRef(view.goalIndex);
  useEffect(() => {
    if (view.goalIndex === shownGoal.current) return;
    const went = view.goalIndex > shownGoal.current;
    const met = TRAINING_GOALS[shownGoal.current];
    shownGoal.current = view.goalIndex;
    if (!went || !met) return; // a Super Jump ran out: back to the orb, no praise
    void notifySuccess();
    setPraise({ title: met.title, text: met.done });
    const t = window.setTimeout(() => setPraise(null), PRAISE_MS);
    return () => window.clearTimeout(t);
  }, [view.goalIndex]);

  useEffect(() => {
    if (!view.done) return;
    const t = window.setTimeout(onDone, 900);
    return () => window.clearTimeout(t);
  }, [view.done, onDone]);

  const goal = TRAINING_GOALS[Math.min(view.goalIndex, TRAINING_GOALS.length - 1)];
  const hint = trainingHint(goal, touch ? scheme : "keys");
  const orbColor = goal.id === "grab" || goal.id === "use" ? POWER_UP_SPECS["super-jump"].color : undefined;

  return (
    <div
      ref={boxRef}
      data-climb-surface
      onPointerDownCapture={unlockAudio}
      className="exp-stage fixed inset-0 z-40 overflow-hidden bg-void"
    >
      <ClimbCanvas
        state={training.state}
        feed={feed}
        width={size.width}
        height={size.height}
        bottomInset={bottomInset}
        fullBleed
        hudInsetTop={safeArea.top}
        includeHud={false}
        myAvatarId={myAvatarId}
      />

      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3"
        style={{ paddingTop: `calc(${safeArea.top}px + 0.5rem)` }}
      >
        <section
          aria-labelledby="training-goal"
          data-training-goal={goal.id}
          className="pointer-events-auto mx-auto max-w-md rounded-3xl border border-white/10 bg-void/80 px-4 pb-3.5 pt-3 shadow-[0_12px_40px_-10px_rgba(0,0,0,0.8)] backdrop-blur-xl"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-label font-bold uppercase tracking-eyebrow text-signal">
              Training · {Math.min(view.goalIndex + 1, TRAINING_GOALS.length)} of {TRAINING_GOALS.length}
            </p>
            <button
              type="button"
              onClick={() => {
                void tapLight();
                onSkip();
              }}
              className="-mr-2 min-h-[44px] rounded-full px-3 font-mono text-label uppercase tracking-label text-text-secondary active:scale-95"
            >
              Skip
            </button>
          </div>
          <ol aria-hidden className="mt-1 flex gap-1.5">
            {TRAINING_GOALS.map((g, i) => (
              <li
                key={g.id}
                className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                  i < view.goalIndex ? "bg-signal" : i === view.goalIndex ? "bg-signal/50" : "bg-white/10"
                }`}
              />
            ))}
          </ol>
          <div key={goal.id} className="tr-in">
            <h2
              id="training-goal"
              className="mt-3 font-display text-title font-black uppercase leading-none tracking-tight text-text-primary"
              style={orbColor ? { color: orbColor } : undefined}
            >
              {view.done ? "Summit!" : goal.title}
            </h2>
            {!view.done && (
              <p className="mt-1.5 text-meta leading-snug text-text-secondary">{hint}</p>
            )}
            {touch && !view.done && (
              // Try both layouts on the practice tower; the choice is the saved setting.
              <button
                type="button"
                onClick={() => {
                  void tapLight();
                  setScheme(otherScheme);
                }}
                className="mt-2 min-h-[44px] rounded-full border border-white/15 px-3.5 font-mono text-label uppercase tracking-label text-text-primary active:scale-95"
              >
                {otherScheme === "joystick" ? "Try the joystick" : "Try the buttons"}
              </button>
            )}
          </div>
          {praise && (
            <p key={praise.title} className="tr-in mt-2.5 flex gap-2 rounded-xl bg-signal/10 px-3 py-2 text-meta text-text-primary">
              <span aria-hidden className="font-bold text-signal">✓</span>
              <span>
                <span className="font-bold">{praise.title}.</span> {praise.text}
              </span>
            </p>
          )}
        </section>
        {/* One region that stays mounted, so each new goal is announced. */}
        <p className="sr-only" role="status" aria-live="polite">
          {view.done
            ? "Summit! Training complete."
            : `${praise ? `${praise.title} done. ${praise.text} ` : ""}Next: ${goal.title}. ${hint}`}
        </p>
        <div className="mx-auto mt-2 max-w-md">
          <ActivePowerStack player={player} tick={view.tick} />
        </div>
      </div>

      <TouchControls active={!view.done} onInput={setTouch} />
      <style>{`
        .tr-in { animation: trIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both; }
        @keyframes trIn { from { transform: translateY(6px); opacity: 0; } to { transform: none; opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .tr-in { animation: none; } }
      `}</style>
    </div>
  );
}
