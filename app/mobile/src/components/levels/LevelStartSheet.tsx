import { useEffect, useRef, useState } from "react";
import { POWER_UP_SPECS } from "@app/game/powerups";
import { ALTITUDE_UNIT } from "@app/lib/units";
import { Button } from "../ui";
import { tapLight } from "../../lib/haptics";
import {
  episodeOf,
  formatClock,
  isHardLevel,
  type LevelNode,
  type LevelTicket,
  type PlayerStats,
  type StartRefusal,
} from "../../lib/levels/model";
import { HeartIcon, StarRow, livesLabel, useNow } from "./LevelBits";

const REFUSAL_COPY: Record<Exclude<StartRefusal, "OUT_OF_LIVES">, string> = {
  LOCKED: "Clear the level before this one first.",
  UPDATE_REQUIRED: "Update the app to play this level.",
  NETWORK: "Couldn’t reach the server. Check your connection and try again.",
};

/**
 * The level start card (Candy Crush's "Level 12 · Play" popup): the goal, the
 * star times, what's new on this level, and what it costs. Play asks the
 * server for a run ticket; out of lives, it offers the wait, Practice, or a
 * lives-free practice of this level instead (§5b).
 */
export function LevelStartSheet({
  node,
  player,
  onStart,
  onPractice,
  onPracticeLevel,
  onClose,
}: {
  node: LevelNode;
  player: PlayerStats;
  /** Resolves to a ticket, or the reason the level can't start. */
  onStart: () => Promise<{ ok: true; ticket: LevelTicket } | { ok: false; code: StartRefusal }>;
  onPractice: () => void;
  onPracticeLevel: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<StartRefusal | null>(null);
  const now = useNow();
  const hard = isHardLevel(node.level);
  const outOfLives = node.costsLife && (player.lives <= 0 || refusal === "OUT_OF_LIVES");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // A life that arrives while the card is open clears the refusal.
  useEffect(() => {
    if (refusal === "OUT_OF_LIVES" && player.lives > 0) setRefusal(null);
  }, [refusal, player.lives]);

  const play = async () => {
    setBusy(true);
    setRefusal(null);
    const res = await onStart();
    // On success the screen navigates away; only a refusal lands here.
    if (!res.ok) {
      setRefusal(res.code);
      setBusy(false);
    }
  };

  const intro = node.introPowerUp ? POWER_UP_SPECS[node.introPowerUp] : null;
  const titleId = `level-${node.level}-title`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="presentation">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="ls-scrim absolute inset-0 bg-void/70 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="ls-sheet relative w-full max-w-md rounded-t-[28px] border-t border-border-strong bg-surface/95 px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3 backdrop-blur-xl"
      >
        <span aria-hidden className="mx-auto mb-3 block h-1 w-9 rounded-full bg-border-strong" />
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className={`font-mono text-label font-bold uppercase tracking-eyebrow ${hard ? "text-ember" : "text-signal"}`}>
              {hard ? "Hard level" : `Episode ${episodeOf(node.level)}`}
            </p>
            <h2 id={titleId} className="mt-1 font-display text-title font-black uppercase tracking-tight text-text-primary">
              Level {node.level}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={() => {
              void tapLight();
              onClose();
            }}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-raised text-text-secondary transition-transform active:scale-90"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl border border-white/10 bg-elevated/70 px-3.5 py-3">
            <p className="font-mono text-label uppercase tracking-label text-text-secondary">Goal</p>
            <p className="mt-1 font-display text-stat font-black tabular-nums text-text-primary">
              {node.goalFt.toLocaleString()}
              <span className="ml-1 text-meta font-bold uppercase text-text-secondary">{ALTITUDE_UNIT}</span>
            </p>
            <p className="mt-1 text-meta text-text-secondary">Reach the summit</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-elevated/70 px-3.5 py-3">
            <p className="font-mono text-label uppercase tracking-label text-text-secondary">Stars</p>
            <ul className="mt-1.5 flex flex-col gap-1">
              <ParRow stars={3} ms={node.pars.threeStarMs} />
              <ParRow stars={2} ms={node.pars.twoStarMs} />
              <li className="flex items-center justify-between text-meta text-text-secondary">
                <StarRow count={1} size={12} />
                <span>any clear</span>
              </li>
            </ul>
          </div>
        </div>

        {node.stars > 0 && node.bestMs !== null && (
          <p className="mt-3 flex items-center gap-2 text-meta text-text-secondary">
            <StarRow count={node.stars} size={13} />
            Your best {formatClock(node.bestMs)}
          </p>
        )}

        {(intro || node.introTip) && (
          <div className="mt-3 rounded-2xl border border-signal/30 bg-signal/10 px-3.5 py-2.5">
            <p className="font-mono text-label font-bold uppercase tracking-label text-signal">New on this level</p>
            {intro && (
              <p className="mt-1 text-meta text-text-primary">
                <span className="font-bold" style={{ color: intro.color }}>{intro.label}</span>: {intro.description}.
              </p>
            )}
            {node.introTip && <p className="mt-1 text-meta text-text-primary">{node.introTip}</p>}
          </div>
        )}

        {/* The friend ghost picker (§6.1) goes here once ghosts land. */}

        <div className="mt-5 flex flex-col gap-2.5">
          {outOfLives ? (
            <OutOfLives
              wait={livesLabel(player, now)}
              onPractice={onPractice}
              onPracticeLevel={onPracticeLevel}
            />
          ) : (
            <>
              <Button busy={busy} onPress={() => void play()} aria-label={`Play level ${node.level}`} className="min-h-[56px] text-cta">
                Play
              </Button>
              <p className="flex items-center justify-center gap-1.5 text-meta text-text-secondary">
                {node.costsLife ? (
                  <>
                    <HeartIcon size={14} /> Costs 1 life, refunded if you clear it
                  </>
                ) : (
                  "Tutorial level: free to play"
                )}
              </p>
              {refusal && refusal !== "OUT_OF_LIVES" && (
                <p role="alert" className="text-center text-meta text-ember">
                  {REFUSAL_COPY[refusal]}
                </p>
              )}
            </>
          )}
        </div>
      </div>
      <style>{`
        .ls-sheet { animation: lsUp 0.28s cubic-bezier(0.16,1,0.3,1) both; }
        .ls-scrim { animation: lsFade 0.2s ease-out both; }
        @keyframes lsUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes lsFade { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .ls-sheet, .ls-scrim { animation: none; } }
      `}</style>
    </div>
  );
}

function ParRow({ stars, ms }: { stars: number; ms: number }) {
  return (
    <li className="flex items-center justify-between text-meta tabular-nums text-text-primary">
      <StarRow count={stars} size={12} />
      <span>{formatClock(ms)}</span>
    </li>
  );
}

/** Out of lives: when the next one comes, and what to play meanwhile. */
export function OutOfLives({
  wait,
  onPractice,
  onPracticeLevel,
}: {
  wait: string;
  onPractice: () => void;
  onPracticeLevel: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-ember/40 bg-ember/10 px-4 py-3">
        <HeartIcon size={20} />
        <p className="text-body text-text-primary">
          Out of lives. Next life in <span className="font-bold tabular-nums">{wait}</span>
        </p>
      </div>
      <Button variant="secondary" onPress={onPracticeLevel}>
        Practice this level
      </Button>
      <p className="-mt-1 text-center text-meta text-text-secondary">No lives, stars or XP</p>
      <Button variant="ghost" onPress={onPractice}>
        Play Practice
      </Button>
    </div>
  );
}
