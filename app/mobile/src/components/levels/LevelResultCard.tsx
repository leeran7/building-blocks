import { useEffect, useRef, useState } from "react";
import { ALTITUDE_UNIT } from "@app/lib/units";
import { avatarName, stickColorOf } from "@app/lib/avatars";
import { Button } from "../ui";
import {
  feetShort,
  formatClock,
  MAX_STARS,
  type LevelResult,
  type PlayerStats,
} from "../../lib/levels/model";
import { HeartIcon, StarIcon, XpBar, livesLabel, useNow } from "./LevelBits";
import { OutOfLives, type RefillOffer } from "./LevelStartSheet";
import { ChestCollected, ChestReveal } from "./ChestOpening";
import { ArrowRight } from "./LevelIcons";
import { RewardReveal } from "../RewardReveal";
import { CharacterPreview } from "../CharacterPreview";
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
  refill = null,
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
  /** The paid lives refill, offered when a loss leaves no lives. */
  refill?: RefillOffer | null;
}) {
  // A clear that opened chests leads with Collect Rewards; Next level waits
  // below it as a link until the rewards are collected.
  const chestKey = result.chestsOpened.map((c) => c.chestNumber).join();
  const [collectedKey, setCollectedKey] = useState<string | null>(null);
  const chestsOpen = result.chestsOpened.length > 0 && collectedKey !== chestKey;
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
      {/* Keyed by chest: a new clear's chests start their opening afresh. */}
      {chestsOpen ? (
        <ChestReveal key={chestKey} chests={result.chestsOpened} onCollect={() => setCollectedKey(chestKey)} />
      ) : (
        result.chestsOpened.length > 0 && <ChestCollected chests={result.chestsOpened} />
      )}
      {!result.cleared && <StreakLine result={result} />}
      <StuckLine result={result} />

      {retryError && (
        <p role="alert" className="mt-4 text-center text-meta text-ember">
          {retryError}
        </p>
      )}
      <div className={`${chestsOpen ? "mt-1" : "mt-6"} flex flex-col gap-2.5`}>
        {result.cleared ? (
          <>
            {hasNextLevel &&
              (chestsOpen ? (
                <button
                  type="button"
                  onClick={onNext}
                  className="mx-auto flex min-h-[44px] items-center gap-2 px-4 font-display text-meta font-black uppercase tracking-wide text-text-primary transition-transform active:scale-95"
                >
                  Next level <ArrowRight size={18} />
                </button>
              ) : (
                <Button onPress={onNext} className="min-h-[56px] text-cta">
                  Next level
                </Button>
              ))}
            <StreakLine result={result} divider />
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
            refill={refill}
          />
        )}
      </div>
    </Sheet>
  );
}

/** The win streak after a frontier run; replays leave it alone and say nothing. */
export function StreakLine({
  result,
  divider = false,
}: {
  result: Pick<LevelResult, "atFrontier" | "streak" | "cleared">;
  /** Drawn as a rule between the clear's actions, label in the middle. */
  divider?: boolean;
}) {
  if (!result.atFrontier || result.streak === null) return null;
  const text =
    result.streak > 0
      ? `Win streak ${result.streak}`
      : result.cleared
        ? "Win streak 0"
        : "Win streak reset. Clear a new level to start one.";
  if (divider) {
    return (
      <p className="my-1 flex items-center gap-3 font-mono text-label font-bold uppercase tracking-label text-text-secondary">
        <span aria-hidden className="h-px flex-1 bg-white/15" />
        {text}
        <span aria-hidden className="h-px flex-1 bg-white/15" />
      </p>
    );
  }
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
            className={`lr-star ${i === 1 ? "-translate-y-2" : ""}`}
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
        <UnlockedAvatars ids={result.unlockedAvatars ?? []} />
        <XpBar player={result.player} />
      </div>
      <style>{`
        .lr-star { display: inline-flex; animation: lrPop 0.45s cubic-bezier(0.16,1,0.3,1) both; }
        @keyframes lrPop { from { transform: scale(0.3); opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .lr-star { animation: none; } }
      `}</style>
    </>
  );
}

/**
 * "New character unlocked: Falcon" when this run crossed an avatar's rule. The
 * stick figures (unlocked together by the first level 1 clear) read as one.
 */
export function unlockedAvatarNames(ids: readonly string[]): string[] {
  return unlockedAvatars(ids).map((u) => u.name);
}

/**
 * The characters this run unlocked, one per reveal: each named character, and
 * the stick figures once (shown as the first of them).
 */
export function unlockedAvatars(ids: readonly string[]): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  let sticks = false;
  for (const id of ids) {
    if (stickColorOf(id) !== null) {
      if (!sticks) out.push({ id, name: "Stick figures" });
      sticks = true;
      continue;
    }
    const name = avatarName(id);
    if (name !== null) out.push({ id, name });
  }
  return out;
}

/** How long the result card shows before a new character's reveal. */
export const UNLOCK_REVEAL_DELAY_MS = 1100;

/**
 * A new character gets its own moment: the full-screen reward reveal (the
 * one a purchase gets), one character after another, over the result card.
 * The card keeps a line naming them once the reveals are dismissed.
 */
function UnlockedAvatars({ ids }: { ids: string[] }) {
  const unlocked = unlockedAvatars(ids);
  const [shown, setShown] = useState(0);
  // Let the stars land before the reveal takes the screen.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), UNLOCK_REVEAL_DELAY_MS);
    return () => clearTimeout(t);
  }, []);
  if (unlocked.length === 0) return null;
  const next = ready ? unlocked[shown] : undefined;
  return (
    <>
      <p
        role="status"
        data-new-avatar
        className="flex items-center gap-2 rounded-full border border-signal/40 bg-signal/10 py-1 pl-1 pr-3 text-center font-mono text-label font-bold uppercase tracking-label text-signal"
      >
        <span aria-hidden className="inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-void/60">
          <CharacterPreview avatarId={unlocked[0].id} pose="idle" locked={false} figurePx={20} sizePx={24} />
        </span>
        {unlocked.length === 1 ? "New character unlocked" : "New characters unlocked"}: {unlocked.map((u) => u.name).join(", ")}
      </p>
      {next && (
        <RewardReveal
          key={next.id}
          subject={<CharacterPreview avatarId={next.id} pose="idle" locked={false} figurePx={190} sizePx={230} />}
          eyebrow={next.name === "Stick figures" ? "New characters unlocked" : "New character unlocked"}
          title={next.name}
          detail="Pick it in Choose Character."
          doneLabel={shown + 1 < unlocked.length ? "Next" : "Continue"}
          onDone={() => setShown((n) => n + 1)}
        />
      )}
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
        {Math.round(peakFt).toLocaleString()} of {Math.round(goalFt).toLocaleString()} {ALTITUDE_UNIT}
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
  refill,
}: {
  player: PlayerStats;
  costsLife: boolean;
  retryBusy: boolean;
  onRetry: () => void;
  onMap: () => void;
  onPractice: () => void;
  onPracticeLevel: () => void;
  refill: RefillOffer | null;
}) {
  const now = useNow();
  if (costsLife && player.lives <= 0) {
    return (
      <>
        <OutOfLives
          wait={livesLabel(player, now)}
          onPractice={onPractice}
          onPracticeLevel={onPracticeLevel}
          refill={refill}
        />
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
 * On a short phone a tall card (a chest opening) scrolls rather than
 * pushing its heading off the top.
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
      className="lr-card absolute outline-none focus-visible:outline-none inset-x-0 bottom-0 z-30 mx-auto max-h-[calc(100dvh-env(safe-area-inset-top))] max-w-md overflow-y-auto overscroll-contain rounded-t-3xl border-t border-border-strong bg-surface/95 px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-3 backdrop-blur-xl"
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
