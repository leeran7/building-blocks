import { useEffect, useRef, useState, type ReactNode } from "react";
import { POWER_UP_SPECS } from "@app/game/powerups";
import { ALTITUDE_UNIT } from "@app/lib/units";
import { formatGems } from "@app/lib/avatars";
import { Button } from "../ui";
import { tapLight } from "../../lib/haptics";
import { useSwipeToDismiss } from "../../hooks/useSwipeToDismiss";
import {
  episodeOf,
  formatClock,
  isHardLevel,
  type BuyLivesResult,
  type LevelNode,
  type LevelTicket,
  type PlayerStats,
  type StartRefusal,
} from "../../lib/levels/model";
import { Accordion, HeartIcon, StarRow, livesLabel, useNow } from "./LevelBits";
import { ArrowRight, TowerIcon } from "./LevelIcons";
import { GemIcon } from "../store/GemIcon";

/** What a refused start or retry says, in the player's words. */
export const REFUSAL_COPY: Record<Exclude<StartRefusal, "OUT_OF_LIVES">, string> = {
  LOCKED: "Clear the level before this one first.",
  UPDATE_REQUIRED: "Update the app to play this level.",
  BOOSTER_UNAVAILABLE: "That booster can’t be used on this run. Pick again or play without one.",
  NETWORK: "Couldn’t reach the server. Check your connection and try again.",
};

/**
 * The level start card (Candy Crush's "Level 12 · Play" popup): the goal, the
 * star times, what's new on this level, and what it costs. Play asks the
 * server for a run ticket; out of lives, it offers the wait, Endless, or a
 * lives-free practice of this level instead (§5b).
 */
export function LevelStartSheet({
  node,
  player,
  onStart,
  onPractice,
  onPracticeLevel,
  onClose,
  extras,
  refill,
}: {
  node: LevelNode;
  player: PlayerStats;
  /** Resolves to a ticket, or the reason the level can't start. */
  onStart: () => Promise<{ ok: true; ticket: LevelTicket } | { ok: false; code: StartRefusal }>;
  onPractice: () => void;
  onPracticeLevel: () => void;
  onClose: () => void;
  /** Streak, stuck help, boosters and the friends board (LevelStartExtras). */
  extras?: ReactNode;
  /** The paid lives refill, offered when out of lives; absent when none can be sold. */
  refill?: RefillOffer | null;
}) {
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<StartRefusal | null>(null);
  const now = useNow();
  const hard = isHardLevel(node.level);
  const outOfLives = node.costsLife && (player.lives <= 0 || refusal === "OUT_OF_LIVES");
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLButtonElement>(null);
  useSwipeToDismiss(sheetRef, onClose, scrimRef);

  useEffect(() => {
    // Hand focus back to the pin or button that opened the card.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
    // Once per opening: onClose changes identity on every map render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        ref={scrimRef}
        onClick={onClose}
        className="ls-scrim absolute inset-0 bg-void/70 backdrop-blur-sm"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="ls-sheet relative w-full max-w-md rounded-t-[28px] border-t border-border-strong bg-surface/95 px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2 backdrop-blur-xl max-h-[calc(100%-env(safe-area-inset-top)-0.75rem)] overflow-y-auto overscroll-contain"
      >
        {/* The grabber: drag the sheet down from here (or its top) to close it. */}
        <div data-sheet-grabber aria-hidden className="-mx-5 -mt-2 flex h-5 items-center justify-center">
          <span className="block h-1 w-9 rounded-full bg-border-strong" />
        </div>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className={`font-mono text-label font-bold uppercase tracking-eyebrow ${hard ? "text-ember" : "text-signal"}`}>
              {hard ? "Hard level" : `Episode ${episodeOf(node.level)}`}
            </p>
            <h2 id={titleId} className="mt-0.5 font-display text-title font-black uppercase tracking-tight text-text-primary">
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
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-raised text-text-secondary transition-transform active:scale-90"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="mt-3 rounded-2xl border border-white/10 bg-elevated/70 px-3.5 py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="flex items-baseline gap-2">
              <span className="font-mono text-label uppercase tracking-label text-text-secondary">Summit</span>
              <span className="font-display text-headline font-black tabular-nums text-text-primary">
                {formatFeet(node.goalFt)}
                <span className="ml-1 text-meta font-bold uppercase text-text-secondary">{ALTITUDE_UNIT}</span>
              </span>
            </p>
            {node.stars > 0 && node.bestMs !== null && (
              <p className="flex items-center gap-1.5 text-meta tabular-nums text-text-secondary">
                <StarRow count={node.stars} size={11} />
                Best {formatClock(node.bestMs)}
              </p>
            )}
          </div>
          <ul aria-label="Star times" className="mt-2 grid grid-cols-3 divide-x divide-white/10">
            <ParRow stars={3} ms={node.pars.threeStarMs} />
            <ParRow stars={2} ms={node.pars.twoStarMs} />
            {node.pars.oneStarMs !== null ? (
              <ParRow stars={1} ms={node.pars.oneStarMs} />
            ) : (
              <li className="flex items-center justify-end gap-1.5 pl-2 text-meta text-text-secondary">
                <StarRow count={1} size={11} />
                <span>any clear</span>
              </li>
            )}
          </ul>
        </div>

        {(intro || node.introTip) && (
          <div className="mt-2 rounded-2xl border border-signal/30 bg-signal/10 px-3.5 py-2">
            <p className="font-mono text-label font-bold uppercase tracking-label text-signal">New on this level</p>
            {intro && (
              <p className="mt-0.5 text-meta text-text-primary">
                <span className="font-bold" style={{ color: intro.color }}>{intro.label}</span>: {intro.description}.
              </p>
            )}
            {node.introTip && <p className="mt-0.5 text-meta text-text-primary">{node.introTip}</p>}
          </div>
        )}

        <PowerUpsCard powerUps={node.powerUps} />

        {/* The friend ghost picker (§6.1) goes here once ghosts land. */}
        {extras}

        <div className="mt-4 flex flex-col gap-1.5">
          {outOfLives ? (
            <OutOfLives
              wait={livesLabel(player, now)}
              onPractice={onPractice}
              onPracticeLevel={onPracticeLevel}
              refill={refill}
            />
          ) : (
            <>
              <Button busy={busy} onPress={() => void play()} aria-label={`Play level ${node.level}`} className="min-h-[52px] text-cta">
                Play
              </Button>
              <p className="flex items-center justify-center gap-1.5 text-meta text-text-secondary">
                {node.costsLife ? (
                  <>
                    <HeartIcon size={14} /> Costs 1 life · refunded when you clear it
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

/** Feet for the summit line: whole feet with thousands separators ("1,204"). */
export function formatFeet(ft: number): string {
  return Math.round(ft).toLocaleString("en-US");
}

/** Seconds for a chip: whole numbers bare, otherwise one decimal. */
function formatSeconds(s: number): string {
  const r = Math.round(s * 10) / 10;
  return `${Number.isInteger(r) ? r : r.toFixed(1)}s`;
}

/**
 * This level's power-ups before the match: how often an orb turns up and how
 * long each type lasts here. Both are set per level and shrink as the season
 * gets harder.
 */
export function PowerUpsCard({ powerUps }: { powerUps: LevelNode["powerUps"] }) {
  if (powerUps.floorsPerOrb === null) {
    return (
      <div className="mt-2 flex min-h-[48px] items-center gap-3 rounded-2xl border border-white/10 bg-elevated/70 px-3.5 py-2">
        <TowerIcon size={18} className="shrink-0 text-text-secondary" />
        <p className="font-mono text-label uppercase tracking-label text-text-secondary">On the tower</p>
        <p className="ml-auto text-meta text-text-primary">No power-ups</p>
      </div>
    );
  }
  return (
    <Accordion
      label="On the tower"
      icon={<TowerIcon size={18} />}
      summary={`Power-up every ${powerUps.floorsPerOrb} floors`}
    >
      <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5" aria-label="Power-ups on this level and how long they last">
        {powerUps.types.map((t) => {
          const spec = POWER_UP_SPECS[t];
          const s = powerUps.seconds[t];
          return (
            <li key={t} className="flex items-center gap-1.5 text-meta text-text-primary">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: spec.color }} />
              <span className="min-w-0 truncate">{spec.label}</span>
              {s !== undefined && (
                <span className="ml-auto shrink-0 tabular-nums text-text-secondary">
                  {t === "jetpack" ? `${formatSeconds(s)} fuel` : formatSeconds(s)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Accordion>
  );
}

/** One star time; the three share the row in thirds, split by rules. */
function ParRow({ stars, ms }: { stars: number; ms: number }) {
  return (
    <li className="flex items-center justify-center gap-1.5 text-meta tabular-nums text-text-primary first:justify-start first:pr-2 last:justify-end last:pl-2">
      <StarRow count={stars} size={11} />
      <span>{formatClock(ms)}</span>
    </li>
  );
}

/** The paid lives refill as the out-of-lives card offers it. */
export interface RefillOffer {
  gems: number;
  cost: number;
  buy: () => Promise<BuyLivesResult>;
  /** Opens the gem packs; absent where the Shop is not mounted. */
  onGetGems?: () => void;
}

const REFILL_ERROR: Record<Exclude<BuyLivesResult, { ok: true }>["code"], string | null> = {
  // The card redraws with the lives that came back; nothing to say.
  LIVES_FULL: null,
  NOT_ENOUGH_GEMS: "Not enough gems for a refill.",
  NETWORK: "Couldn’t reach the server. Check your connection and try again.",
};

/**
 * Out of lives: when the next one comes, a paid refill when the player can
 * buy one, and what to play meanwhile.
 */
export function OutOfLives({
  wait,
  onPractice,
  onPracticeLevel,
  refill = null,
}: {
  wait: string;
  onPractice: () => void;
  onPracticeLevel: () => void;
  refill?: RefillOffer | null;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {/* Announced once; the ticking countdown below is not a live region. */}
      <p role="alert" className="sr-only">Out of lives.</p>
      <div className="flex items-center justify-center gap-2.5 rounded-2xl border border-ember/60 bg-ember/10 px-4 py-3.5">
        <HeartIcon size={22} />
        <p className="text-body text-text-primary">
          <span className="font-bold">Out of lives.</span>{" "}
          <span className="text-text-secondary">Next life in</span>{" "}
          <span className="font-display text-lead font-black tabular-nums">{wait}</span>
        </p>
      </div>
      {refill && <RefillLives offer={refill} />}
      <Button variant="secondary" onPress={onPracticeLevel} className="min-h-[52px] text-cta">
        Practice this level
      </Button>
      <p className="-mt-1 text-center text-meta text-text-secondary">No lives used. No stars or XP earned.</p>
      <button
        type="button"
        onClick={() => {
          void tapLight();
          onPractice();
        }}
        className="mx-auto flex min-h-[44px] items-center gap-1.5 px-4 text-body font-semibold text-signal transition-transform active:scale-95"
      >
        Play endless <ArrowRight size={16} />
      </button>
    </div>
  );
}

/**
 * Refill lives to full with gems instead of waiting. The server charges once
 * and refuses a full player, so a double tap never pays twice. Without enough
 * gems the price and balance still show, so the player knows what it costs.
 */
function RefillLives({ offer }: { offer: RefillOffer }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const affordable = offer.gems >= offer.cost;

  const buy = async () => {
    setBusy(true);
    setError(null);
    const res = await offer.buy();
    // On success the card redraws with full lives; only a refusal lands here.
    if (!res.ok) setError(REFILL_ERROR[res.code]);
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="rounded-2xl border border-white/10 bg-elevated/70 px-4 py-3 text-center">
        <p className="flex items-center justify-center gap-2.5 font-display text-lead font-bold text-text-primary">
          <GemIcon size={22} /> Full refill · {formatGems(offer.cost)} gems
        </p>
        <p className="mt-1 text-meta text-text-secondary">
          Your balance: {formatGems(offer.gems)} gems
          {!affordable && ` · ${formatGems(offer.cost - offer.gems)} more needed`}
        </p>
      </div>
      {affordable ? (
        <Button
          busy={busy}
          onPress={() => void buy()}
          aria-label={`Refill lives for ${offer.cost} gems`}
          className="min-h-[52px] text-cta"
        >
          <HeartIcon size={16} className="text-void" /> Refill lives · {formatGems(offer.cost)} gems
        </Button>
      ) : (
        offer.onGetGems && (
          <Button onPress={offer.onGetGems} className="min-h-[52px] text-cta">
            Get gems
          </Button>
        )
      )}
      {error && (
        <p role="alert" className="text-center text-meta text-ember">
          {error}
        </p>
      )}
    </div>
  );
}
