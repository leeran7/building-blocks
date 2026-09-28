import { useEffect, useRef } from "react";
import { ALTITUDE_UNIT } from "@app/lib/units";
import { Button } from "../ui";
import {
  feetShort,
  formatClock,
  MAX_STARS,
  type LevelResult,
  type PlayerStats,
} from "../../lib/levels/model";
import { HeartIcon, StarIcon, XpBar, livesLabel, useNow } from "./LevelBits";
import { OutOfLives } from "./LevelStartSheet";
import { ChestReveal } from "./LevelChests";
import { STUCK_BOOSTER_FAILS } from "@app/levels/engagement";

/**
 * The end of a level run. A clear shows the stars earned against the star
 * times, the XP and the next level; a loss shows how close the summit was and
 * a one-tap retry, or the out-of-lives choices when no life is left.
 *
 * A run at the frontier also shows the win streak it moved (§6.3).
 */
export function LevelResultCard({
  result,
  costsLife,
  hasNextLevel,
  retryBusy,
  retryError = null,
  onNext,
  onRetry,
  onMap,
  onPractice,
  onPracticeLevel,
  nearMiss = null,
}: {
  result: LevelResult;
  /** Whether a retry of this level spends a life (tutorial levels don't). */
  costsLife: boolean;
  /** "2 floors from the summit!" when a loss came close (§6.2). */
  nearMiss?: string | null;
  hasNextLevel: boolean;
  retryBusy: boolean;
  /** Why the last Retry could not start, in the player's words. */
  retryError?: string | null;
  onNext: () => void;
  onRetry: () => void;
  onMap: () => void;
  onPractice: () => void;
  onPracticeLevel: () => void;
}) {
  const label = result.cleared
    ? `Level ${result.level} cleared, ${result.stars} of ${MAX_STARS} stars`
    : (nearMiss ?? `${result.outOfTime ? "Out of time" : "Caught by the lava"}, ${feetShort(result)} ${ALTITUDE_UNIT} from the summit`);
  return (
    <Sheet label={label}>
      {result.cleared ? (
        <Cleared result={result} />
      ) : (
        <Lost
          goalFt={result.goalFt}
          peakFt={result.peakFt}
          level={result.level}
          outOfTime={result.outOfTime}
          nearMiss={nearMiss}
        />
      )}
      <ChestReveal chests={result.chestsOpened} />
      <StreakLine result={result} />
      <StuckLine result={result} />

      {retryError && (
        <p role="alert" className="mt-4 text-center text-meta text-ember">
          {retryError}
        </p>
      )}
      <div className="mt-6 flex flex-col gap-2.5">
        {result.cleared ? (
          <>
            {hasNextLevel && (
              <Button onPress={onNext} className="min-h-[56px] text-cta">
                Next level
              </Button>
            )}
            <div className="flex gap-2.5">
              <Button variant="secondary" busy={retryBusy} onPress={onRetry} aria-label={`Replay level ${result.level}`}>
                Replay
              </Button>
              <Button variant="secondary" onPress={onMap}>
                Map
              </Button>
            </div>
          </>
        ) : (
          <LossActions
            player={result.player}
            costsLife={costsLife}
            retryBusy={retryBusy}
            onRetry={onRetry}
            onMap={onMap}
            onPractice={onPractice}
            onPracticeLevel={onPracticeLevel}
          />
        )}
      </div>
    </Sheet>
  );
}

/** The win streak after a frontier run; replays leave it alone and say nothing. */
export function StreakLine({ result }: { result: Pick<LevelResult, "atFrontier" | "streak" | "cleared"> }) {
  if (!result.atFrontier || result.streak === null) return null;
  const text =
    result.streak > 0
      ? `Win streak ${result.streak}`
      : result.cleared
        ? "Win streak 0"
        : "Win streak reset. Clear a new level to start one.";
  return (
    <p className="mt-3 text-center font-mono text-label font-bold uppercase tracking-label text-text-secondary">
      {text}
    </p>
  );
}

/** After 3 fails at the frontier the next try starts with free help (§5c). */
export function StuckLine({ result }: { result: Pick<LevelResult, "cleared" | "failsAtLevel"> }) {
  if (result.cleared || result.failsAtLevel < STUCK_BOOSTER_FAILS) return null;
  return (
    <p className="mt-2 text-center text-meta text-signal">Your next try starts with a free power-up.</p>
  );
}

function Cleared({ result }: { result: LevelResult }) {
  return (
    <>
      <p className="text-center font-mono text-label font-bold uppercase tracking-eyebrow text-signal">
        Level {result.level} cleared
      </p>
      <div role="img" aria-label={`${result.stars} of ${MAX_STARS} stars`} className="mt-3 flex items-end justify-center gap-2">
        {Array.from({ length: MAX_STARS }, (_, i) => (
          <span
            key={i}
            className={`lr-star ${i === 1 ? "-translate-y-2" : ""} ${i < result.stars && i >= result.previousStars ? "lr-new" : ""}`}
            style={{ animationDelay: `${0.25 + i * 0.18}s` }}
          >
            <StarIcon filled={i < result.stars} size={i === 1 ? 64 : 52} />
          </span>
        ))}
      </div>
      <p className="mt-3 text-center font-display text-hero font-black tabular-nums text-text-primary">
        {result.timeMs !== null ? formatClock(result.timeMs) : "—"}
      </p>
      <p className="mt-1 text-center font-mono text-label uppercase tracking-label text-text-secondary">
        3★ at {formatClock(result.pars.threeStarMs)} · 2★ at {formatClock(result.pars.twoStarMs)}
        {result.pars.oneStarMs !== null && <> · 1★ at {formatClock(result.pars.oneStarMs)}</>}
      </p>
      <div className="mt-4 flex flex-col items-center gap-2">
        {result.xpGained > 0 && (
          <p className="rounded-full border border-signal/40 bg-signal/15 px-3 py-1 font-mono text-label font-bold uppercase tracking-label text-signal">
            +{result.xpGained.toLocaleString()} XP
          </p>
        )}
        {result.newPlayerLevel !== null && (
          <p role="status" className="font-display text-lead font-black uppercase text-text-primary">
            Player level {result.newPlayerLevel}!
          </p>
        )}
        <XpBar player={result.player} />
      </div>
      <style>{`
        .lr-star { display: inline-flex; animation: lrPop 0.45s cubic-bezier(0.16,1,0.3,1) both; }
        .lr-new svg { filter: drop-shadow(0 0 14px rgba(203,242,77,0.7)); }
        @keyframes lrPop { from { transform: scale(0.3); opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .lr-star { animation: none; } }
      `}</style>
    </>
  );
}

function Lost({
  goalFt,
  peakFt,
  level,
  outOfTime,
  nearMiss = null,
}: {
  goalFt: number;
  peakFt: number;
  level: number;
  outOfTime: boolean;
  nearMiss?: string | null;
}) {
  const short = feetShort({ goalFt, peakFt });
  const pct = goalFt > 0 ? Math.min(100, (peakFt / goalFt) * 100) : 0;
  return (
    <>
      <p className="text-center font-mono text-label font-bold uppercase tracking-eyebrow text-ember">
        {outOfTime ? "Out of time" : "Caught by the lava"} · Level {level}
      </p>
      {nearMiss && (
        <p className="mt-3 text-center font-display text-headline font-black uppercase text-signal">{nearMiss}</p>
      )}
      <p className="mt-3 text-center font-display text-hero font-black tabular-nums text-text-primary">
        {short.toLocaleString()}
        <span className="ml-1 text-lead font-bold uppercase text-text-secondary">{ALTITUDE_UNIT}</span>
      </p>
      <p className="text-center text-body text-text-secondary">from the summit</p>
      <div
        role="progressbar"
        aria-label="Height reached"
        aria-valuemin={0}
        aria-valuemax={goalFt}
        aria-valuenow={Math.round(peakFt)}
        className="mx-auto mt-4 h-2 w-full max-w-xs overflow-hidden rounded-full bg-white/10"
      >
        <span className="block h-full rounded-full bg-ember" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-center font-mono text-label uppercase tracking-label text-text-muted">
        {Math.round(peakFt).toLocaleString()} of {goalFt.toLocaleString()} {ALTITUDE_UNIT}
      </p>
    </>
  );
}

function LossActions({
  player,
  costsLife,
  retryBusy,
  onRetry,
  onMap,
  onPractice,
  onPracticeLevel,
}: {
  player: PlayerStats;
  costsLife: boolean;
  retryBusy: boolean;
  onRetry: () => void;
  onMap: () => void;
  onPractice: () => void;
  onPracticeLevel: () => void;
}) {
  const now = useNow();
  if (costsLife && player.lives <= 0) {
    return (
      <>
        <OutOfLives wait={livesLabel(player, now)} onPractice={onPractice} onPracticeLevel={onPracticeLevel} />
        <Button variant="ghost" onPress={onMap}>
          Map
        </Button>
      </>
    );
  }
  return (
    <>
      <Button busy={retryBusy} onPress={onRetry} className="min-h-[56px] text-cta">
        Retry
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-meta text-text-secondary">
        {costsLife ? (
          <>
            <HeartIcon size={14} />
            {player.lives} of {player.maxLives} lives left
          </>
        ) : (
          "Tutorial level: free to retry"
        )}
      </p>
      <Button variant="ghost" onPress={onMap}>
        Map
      </Button>
    </>
  );
}

/** A practice run's end: no stars, XP or lives involved. */
export function PracticeResultCard({
  level,
  goalFt,
  peakFt,
  timeMs,
  outOfTime,
  onRetry,
  onMap,
  nearMiss = null,
}: {
  level: number;
  goalFt: number;
  peakFt: number;
  timeMs: number | null;
  outOfTime: boolean;
  nearMiss?: string | null;
  onRetry: () => void;
  onMap: () => void;
}) {
  return (
    <Sheet label={`Practice run over, level ${level}`}>
      <p className="text-center font-mono text-label font-bold uppercase tracking-eyebrow text-text-secondary">
        Practice · Level {level}
      </p>
      {timeMs !== null ? (
        <>
          <p className="mt-3 text-center font-display text-hero font-black tabular-nums text-text-primary">
            {formatClock(timeMs)}
          </p>
          <p className="text-center text-body text-text-secondary">Summit reached</p>
        </>
      ) : (
        <Lost goalFt={goalFt} peakFt={peakFt} level={level} outOfTime={outOfTime} nearMiss={nearMiss} />
      )}
      <p className="mt-3 text-center text-meta text-text-muted">Practice runs earn no stars or XP.</p>
      <div className="mt-6 flex gap-2.5">
        <Button onPress={onRetry}>Retry</Button>
        <Button variant="secondary" onPress={onMap}>
          Map
        </Button>
      </div>
    </Sheet>
  );
}

/** The result could not be saved: keep the run and offer a retry. */
export function SubmitFailedCard({ level, busy, onRetry, onMap }: { level: number; busy: boolean; onRetry: () => void; onMap: () => void }) {
  return (
    <Sheet label={`Level ${level}: couldn't save this run`}>
      <p className="text-center font-mono text-label font-bold uppercase tracking-eyebrow text-ember">Level {level}</p>
      <p role="alert" className="mt-3 text-center text-body text-text-primary">
        Couldn&rsquo;t save this run. Check your connection and try again.
      </p>
      <div className="mt-6 flex flex-col gap-2.5">
        <Button busy={busy} onPress={onRetry}>
          Try again
        </Button>
        <Button variant="ghost" onPress={onMap}>
          Map
        </Button>
      </div>
    </Sheet>
  );
}

/**
 * The card's shell. It takes focus when it appears, so a screen reader
 * announces the outcome (its label) as the run ends.
 */
function Sheet({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      className="lr-card absolute outline-none focus-visible:outline-none inset-x-0 bottom-0 z-30 mx-auto max-w-md rounded-t-3xl border-t border-border-strong bg-surface/95 px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-3 backdrop-blur-xl"
    >
      <span aria-hidden className="mx-auto mb-5 block h-1 w-9 rounded-full bg-border-strong" />
      {children}
      <style>{`
        .lr-card { animation: lrUp 0.28s cubic-bezier(0.16,1,0.3,1) both; }
        @keyframes lrUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) { .lr-card { animation: none; } }
      `}</style>
    </div>
  );
}
