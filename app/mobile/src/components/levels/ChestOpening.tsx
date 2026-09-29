import { useEffect, useRef, useState, type CSSProperties } from "react";
import { POWER_UP_SPECS } from "@app/game/powerups";
import type { BoosterType } from "@app/levels/engagement";
import { notifySuccess, tapLight, tapMedium } from "../../lib/haptics";
import { prefersReducedMotion } from "../../lib/motion";
import type { OpenedChest } from "../../lib/levels/model";
import type { NextStart } from "../../lib/levels/boosterPick";
import { BoosterToggle, ChestIcon } from "./LevelChests";

/**
 * The result card's star chest opening (design §6.4). Each chest a clear
 * opened waits closed, wobbling, until tapped; then it shakes, the lid flies
 * open in a burst of light, and its boosters rise out one card at a time.
 * Several chests play in turn, and the run ends on the summary of everything
 * received. Skip jumps straight to that summary.
 *
 * Pure presentation: the server rolled the chests (`OpenedChest[]`), and
 * nothing here picks or reorders what they held. The sparks' angles come
 * from their index, never from Math.random. With reduced motion the chests
 * open at once and the summary shows directly.
 *
 * With `pick`, the boosters received can be equipped for the next level:
 * single-select, only types that level allows. Nothing is spent here; the
 * pick only preselects the next start card's booster.
 */

/** The shake before the lid gives. */
export const CHEST_SHAKE_MS = 380;
/** The lid's flight and the light burst, before the boosters come out. */
export const CHEST_LID_MS = 460;
/** Between one booster card and the next. */
const CARD_STAGGER_MS = 160;
/** Sparks thrown out when the lid opens. */
const SPARK_COUNT = 8;
/** How far the sparks fly, in px (plus up to two 10px steps by index). */
const SPARK_REACH_PX = 46;

/**
 * Transforms and opacity only. The lid tips back on the chest's rear rim
 * (a squash from its bottom edge, its dark underside showing). The
 * reduced-motion block is a backstop: that path never leaves "summary".
 */
const CHEST_CSS = `
  .lc-wobble { animation: lcWobble 1.8s ease-in-out infinite; transform-origin: 50% 90%; }
  @keyframes lcWobble {
    0%, 60%, 100% { transform: rotate(0); }
    68% { transform: rotate(-5deg) scale(1.03); }
    76% { transform: rotate(5deg) scale(1.03); }
    84% { transform: rotate(-3deg); }
    92% { transform: rotate(2deg); }
  }
  .lc-glow { background: radial-gradient(circle, rgba(203,242,77,0.45), transparent 70%); animation: lcGlow 1.8s ease-in-out infinite; }
  @keyframes lcGlow { 0%, 100% { opacity: 0.25; transform: scale(0.9); } 50% { opacity: 0.6; transform: scale(1.05); } }
  .lc-glow-on { animation: lcGlowOn ${CHEST_LID_MS}ms ease-out both; }
  @keyframes lcGlowOn { from { opacity: 0.4; transform: scale(0.8); } to { opacity: 0.9; transform: scale(1.3); } }
  .lc-shake { animation: lcShake ${CHEST_SHAKE_MS}ms linear both; transform-origin: 50% 90%; }
  @keyframes lcShake {
    0% { transform: translateX(0) rotate(0); }
    20% { transform: translateX(-3px) rotate(-6deg); }
    40% { transform: translateX(3px) rotate(6deg); }
    60% { transform: translateX(-3px) rotate(-5deg) scale(1.04); }
    80% { transform: translateX(2px) rotate(4deg) scale(1.06); }
    100% { transform: translateX(0) rotate(0) scale(1.08); }
  }
  .lc-lid { transform-box: fill-box; transform-origin: 50% 100%; }
  .lc-lid-fly { animation: lcLid ${CHEST_LID_MS}ms cubic-bezier(.2,1.1,.4,1) both; }
  .lc-lid-open { transform: translateY(-9px) scaleY(0.55); }
  @keyframes lcLid {
    0% { transform: translateY(0) scaleY(1); }
    35% { transform: translateY(-20px) scaleY(0.25) rotate(-5deg); }
    70% { transform: translateY(-7px) scaleY(0.6); }
    100% { transform: translateY(-9px) scaleY(0.55); }
  }
  .lc-lid-under { opacity: 0; }
  .lc-lid-open .lc-lid-under { opacity: 0.55; }
  .lc-lid-fly .lc-lid-under { animation: lcLidUnder ${CHEST_LID_MS}ms ease-out both; }
  @keyframes lcLidUnder { 0%, 20% { opacity: 0; } 100% { opacity: 0.55; } }
  .lc-rays {
    background: repeating-conic-gradient(rgba(203,242,77,0.35) 0deg 10deg, transparent 10deg 30deg);
    -webkit-mask-image: radial-gradient(circle, #000 20%, transparent 70%);
    mask-image: radial-gradient(circle, #000 20%, transparent 70%);
    animation: lcRays ${CHEST_LID_MS * 2}ms ease-out both;
  }
  @keyframes lcRays { from { opacity: 0; transform: scale(0.3) rotate(0); } 40% { opacity: 1; } to { opacity: 0.45; transform: scale(1) rotate(40deg); } }
  .lc-spark { animation: lcSpark ${CHEST_LID_MS + 120}ms cubic-bezier(.1,.7,.3,1) both; }
  @keyframes lcSpark { from { transform: translate(0, 0) scale(1.2); opacity: 1; } to { transform: translate(var(--dx), var(--dy)) scale(0.3); opacity: 0; } }
  .lc-cards { perspective: 600px; }
  .lc-card { animation: lcCard 420ms cubic-bezier(.2,1.2,.4,1) both; }
  @keyframes lcCard { from { transform: translateY(22px) rotateY(90deg); opacity: 0; } to { transform: translateY(0) rotateY(0); opacity: 1; } }
  @media (prefers-reduced-motion: reduce) {
    .lc-wobble, .lc-glow, .lc-glow-on, .lc-shake, .lc-lid-fly, .lc-lid-fly .lc-lid-under, .lc-rays, .lc-card { animation: none; }
    .lc-spark { display: none; }
  }
`;

type Phase = "closed" | "shaking" | "opening" | "open" | "summary";

/** Equipping a received booster for the next level. */
export interface ChestPick {
  next: NextStart;
  selected: BoosterType | null;
  onSelect: (type: BoosterType | null) => void;
}

/** Why a received booster cannot be picked for the next level, or null when it can. */
export function pickBlocked(type: BoosterType, next: NextStart): string | null {
  if (!next.allowed.includes(type)) return "Unlocks on a later level";
  if (type === next.freeType) return `Free on level ${next.level}`;
  return null;
}

/** The result card's opening of the chests a clear opened. */
export function ChestReveal({ chests, pick = null }: { chests: readonly OpenedChest[]; pick?: ChestPick | null }) {
  const [reduced] = useState(prefersReducedMotion);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>(reduced ? "summary" : "closed");
  const rootRef = useRef<HTMLDivElement>(null);
  const firstPhase = useRef(true);
  // The live region mounts empty and fills after, or a screen reader would
  // not announce it (reduced motion starts on the summary).
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);

  // The shake hands over to the lid, and the lid to the boosters.
  useEffect(() => {
    if (phase !== "shaking" && phase !== "opening") return;
    const id = setTimeout(
      () => {
        if (phase === "shaking") void notifySuccess();
        setPhase(phase === "shaking" ? "opening" : "open");
      },
      phase === "shaking" ? CHEST_SHAKE_MS : CHEST_LID_MS,
    );
    return () => clearTimeout(id);
  }, [phase]);

  // The tapped button goes away with its phase; keep keyboard focus in the
  // reveal rather than dropping it on the page (never a trap: Tab moves on).
  useEffect(() => {
    if (firstPhase.current) {
      firstPhase.current = false;
      return;
    }
    if (document.activeElement === document.body) rootRef.current?.focus({ preventScroll: true });
  }, [phase, index]);

  const chest = chests[index];
  if (!chest) return null;
  const several = chests.length > 1;
  const last = index === chests.length - 1;
  const ofN = several ? `${index + 1} of ${chests.length}` : null;

  const open = () => {
    void tapMedium();
    setPhase("shaking");
  };
  const next = () => {
    void tapMedium();
    setIndex(index + 1);
    setPhase("shaking");
  };
  const toSummary = () => {
    void tapLight();
    setPhase("summary");
  };

  const labels = (types: readonly BoosterType[]) => types.map((b) => POWER_UP_SPECS[b].label).join(", ");
  const said = !live
    ? ""
    : phase === "summary"
      ? summaryLine(chests)
      : phase === "open"
        ? `${ofN ? `Chest ${ofN}` : "Chest opened"}: ${labels(chest.boosters)}`
        : "";

  return (
    <div ref={rootRef} tabIndex={-1} className="outline-none">
      <p role="status" className="sr-only">
        {said}
      </p>
      {phase === "summary" ? (
        <ChestSummary chests={chests} pick={pick} />
      ) : (
        // Compact on purpose: the result card sits on the bottom of short
        // phones (the stage shrinks under 700px tall), so the count and
        // Skip ride the panel's corners.
        <div className="relative mt-4 rounded-2xl border border-signal/40 bg-signal/10 px-3 pb-3 pt-2 text-center [@media(max-height:700px)]:pb-2 [@media(max-height:700px)]:pt-1">
          {ofN && (
            <span className="absolute left-3 top-3 font-mono text-label font-bold uppercase tracking-label text-text-secondary">
              {ofN}
            </span>
          )}
          {/* On the last chest, open, Collect does what Skip would. */}
          {!(last && phase === "open") && (
            <button
              type="button"
              onClick={toSummary}
              className="absolute right-1 top-0 z-10 min-h-[44px] rounded-xl px-3 font-mono text-label font-bold uppercase tracking-label text-text-secondary transition-transform active:scale-95"
            >
              {several ? "Skip all" : "Skip"}
            </button>
          )}
          {phase === "closed" ? (
            <button
              type="button"
              onClick={open}
              aria-label={ofN ? `Open star chest ${ofN}` : "Open star chest"}
              className="mx-auto flex min-h-[44px] flex-col items-center rounded-2xl px-4 transition-transform active:scale-95"
            >
              <ChestStage key={chest.chestNumber} phase={phase} chestNumber={chest.chestNumber} />
              <span className="flex items-baseline gap-2">
                <span className="font-display text-lead font-black uppercase text-signal">Star chest!</span>
                <span className="text-meta text-text-secondary">Tap to open</span>
              </span>
            </button>
          ) : (
            <div className="mx-auto flex flex-col items-center px-4">
              <ChestStage key={chest.chestNumber} phase={phase} chestNumber={chest.chestNumber} />
              <span className="font-display text-lead font-black uppercase text-signal">
                {phase === "shaking" ? "Star chest!" : "Chest opened!"}
              </span>
            </div>
          )}
          {phase === "open" && (
            <>
              <ul aria-label={`Boosters from chest ${index + 1}`} className="lc-cards mt-2 flex flex-wrap justify-center gap-2">
                {chest.boosters.map((type, i) => (
                  <BoosterCard key={i} type={type} delayMs={i * CARD_STAGGER_MS} pick={pick} />
                ))}
              </ul>
              {pick && <PickHint pick={pick} types={chest.boosters} />}
              <button
                type="button"
                onClick={last ? toSummary : next}
                className="mt-2 min-h-[44px] w-full rounded-xl border border-signal/50 bg-signal/15 px-4 font-mono text-label font-bold uppercase tracking-label text-signal transition-transform active:scale-95"
              >
                {last ? "Collect" : `Open chest ${index + 2} of ${chests.length}`}
              </button>
            </>
          )}
          <style>{CHEST_CSS}</style>
        </div>
      )}
    </div>
  );
}

/** Everything the chests held, added up: boosters in the order they came out. */
function chestTotals(chests: readonly OpenedChest[]): Array<{ type: BoosterType; n: number }> {
  const counts = new Map<BoosterType, number>();
  for (const c of chests) for (const b of c.boosters) counts.set(b, (counts.get(b) ?? 0) + 1);
  return [...counts].map(([type, n]) => ({ type, n }));
}

function summaryTitle(chests: readonly OpenedChest[]): string {
  return chests.length === 1 ? "Star chest opened!" : `${chests.length} star chests opened!`;
}

/** What the live region says once everything is out. */
function summaryLine(chests: readonly OpenedChest[]): string {
  const got = chestTotals(chests).map(({ type, n }) => `+${n} ${POWER_UP_SPECS[type].label}`);
  return `${summaryTitle(chests)} ${got.join(", ")}`;
}

/**
 * The pick's one line: what is equipped for the next level, or the offer.
 * Polite live region, so equipping is announced where focus stays.
 */
function PickHint({ pick, types }: { pick: ChestPick; types: readonly BoosterType[] }) {
  const { next, selected } = pick;
  const text =
    selected !== null
      ? `${POWER_UP_SPECS[selected].label} ready for level ${next.level}. Tap it again to save it for later.`
      : types.some((t) => pickBlocked(t, next) === null)
        ? `Use one on your next level: tap it to equip for level ${next.level}.`
        : "Spend them from any level\u2019s start card.";
  return (
    <p aria-live="polite" className="mt-2 text-meta text-text-secondary">
      {text}
    </p>
  );
}

/** The reveal's last word: every booster received, added up. */
function ChestSummary({ chests, pick }: { chests: readonly OpenedChest[]; pick: ChestPick | null }) {
  const totals = chestTotals(chests);
  return (
    <div className="lc-pop mt-4 rounded-2xl border border-signal/40 bg-signal/10 px-4 py-3 text-center">
      <div className="flex items-center justify-center gap-2">
        <ChestIcon size={28} open />
        <p className="font-display text-lead font-black uppercase text-signal">{summaryTitle(chests)}</p>
      </div>
      <ul aria-label="Boosters from the chest" className="mt-2 flex flex-wrap justify-center gap-2">
        {totals.map(({ type, n }) => {
          const spec = POWER_UP_SPECS[type];
          if (pick) {
            const blocked = pickBlocked(type, pick.next);
            return (
              <li key={type}>
                <BoosterToggle
                  type={type}
                  prefix={`+${n}`}
                  pressed={pick.selected === type}
                  disabledReason={blocked}
                  label={`+${n} ${spec.label}${blocked ? `, ${blocked.toLowerCase()}` : `, use on level ${pick.next.level}`}`}
                  onToggle={pick.onSelect}
                />
              </li>
            );
          }
          return (
            <li
              key={type}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-surface/70 px-2.5 py-1 text-meta font-bold"
              style={{ color: spec.color }}
            >
              <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: spec.color }} />
              +{n} {spec.label}
            </li>
          );
        })}
      </ul>
      {pick ? (
        <PickHint pick={pick} types={totals.map((t) => t.type)} />
      ) : (
        <p className="mt-2 text-meta text-text-secondary">Spend them from any level&rsquo;s start card.</p>
      )}
      <style>{`
        .lc-pop { animation: lcPop 420ms cubic-bezier(.2,1.4,.4,1) both; }
        @keyframes lcPop { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .lc-pop { animation: none; } }
      `}</style>
    </div>
  );
}

/** One booster out of the chest: a card in its power-up's colour. */
function BoosterCard({ type, delayMs, pick }: { type: BoosterType; delayMs: number; pick: ChestPick | null }) {
  const spec = POWER_UP_SPECS[type];
  if (pick) {
    const blocked = pickBlocked(type, pick.next);
    return (
      <li className="lc-card" style={{ animationDelay: `${delayMs}ms` }}>
        <BoosterToggle
          type={type}
          pressed={pick.selected === type}
          disabledReason={blocked}
          label={`${spec.label}${blocked ? `, ${blocked.toLowerCase()}` : `, use on level ${pick.next.level}`}`}
          onToggle={pick.onSelect}
        />
      </li>
    );
  }
  return (
    <li
      className="lc-card flex min-w-[88px] items-center justify-center gap-1.5 rounded-xl border-2 bg-elevated px-3 py-1.5"
      style={{ borderColor: spec.color, animationDelay: `${delayMs}ms` }}
    >
      <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: spec.color }} />
      <span className="text-meta font-bold" style={{ color: spec.color }}>
        {spec.label}
      </span>
    </li>
  );
}

/**
 * Where a spark flies: evenly round the circle, nudged by the chest number
 * so consecutive chests don't burst identically. Deterministic by design.
 */
function sparkOffset(i: number, chestNumber: number): { dx: number; dy: number } {
  const deg = (360 / SPARK_COUNT) * i + ((chestNumber * 17) % 45) - 90;
  const reach = SPARK_REACH_PX + (i % 3) * 10;
  const rad = (deg * Math.PI) / 180;
  return { dx: Math.round(Math.cos(rad) * reach), dy: Math.round(Math.sin(rad) * reach) };
}

/** The big chest with its glow, rays and sparks, animated by phase. */
function ChestStage({ phase, chestNumber }: { phase: Exclude<Phase, "summary">; chestNumber: number }) {
  const opened = phase === "opening" || phase === "open";
  return (
    <span
      aria-hidden
      data-chest-phase={phase}
      className="pointer-events-none relative flex h-24 w-24 items-center justify-center [@media(max-height:700px)]:h-[60px] [@media(max-height:700px)]:w-[60px]"
    >
      <span className={`lc-glow absolute inset-2 rounded-full ${opened ? "lc-glow-on" : ""}`} />
      {opened && <span className="lc-rays absolute -inset-3 rounded-full" />}
      {phase === "opening" &&
        Array.from({ length: SPARK_COUNT }, (_, i) => {
          const { dx, dy } = sparkOffset(i, chestNumber);
          return (
            <span
              key={i}
              className="lc-spark absolute left-1/2 top-1/2 -ml-1 -mt-1 h-2 w-2 rounded-full bg-signal"
              style={{ "--dx": `${dx}px`, "--dy": `${dy}px`, animationDelay: `${(i % 2) * 40}ms` } as CSSProperties}
            />
          );
        })}
      <span className={`relative inline-flex ${phase === "closed" ? "lc-wobble" : phase === "shaking" ? "lc-shake" : ""}`}>
        <BigChest lid={phase === "opening" ? "flying" : phase === "open" ? "open" : "closed"} />
      </span>
    </span>
  );
}

/** The opening chest's art: a body and a lid that can hinge off it. */
function BigChest({ lid }: { lid: "closed" | "flying" | "open" }) {
  return (
    // Padded viewBox and visible overflow: the lid's flight never clips.
    <svg
      viewBox="-4 -6 72 72"
      overflow="visible"
      fill="none"
      className="h-[76px] w-[76px] overflow-visible [@media(max-height:700px)]:h-12 [@media(max-height:700px)]:w-12"
    >
      {/* The dark inside, hidden under the lid until it lifts. */}
      <rect x="10" y="26" width="44" height="8" rx="2" fill="#0a0a0c" />
      <rect x="9" y="30" width="46" height="24" rx="3" stroke="#cbf24d" strokeWidth="2.5" fill="#1e1c24" />
      <path d="M9 40h46" stroke="#cbf24d" strokeWidth="2" opacity="0.5" />
      <rect x="18" y="30" width="4" height="24" fill="#cbf24d" opacity="0.35" />
      <rect x="42" y="30" width="4" height="24" fill="#cbf24d" opacity="0.35" />
      <g className={lid === "flying" ? "lc-lid lc-lid-fly" : lid === "open" ? "lc-lid lc-lid-open" : "lc-lid"}>
        <path d="M9 30v-6a10 10 0 0 1 10-10h26a10 10 0 0 1 10 10v6z" stroke="#cbf24d" strokeWidth="2.5" fill="#24222c" />
        <rect x="18" y="14" width="4" height="16" fill="#cbf24d" opacity="0.35" />
        <rect x="42" y="14" width="4" height="16" fill="#cbf24d" opacity="0.35" />
        <rect x="28" y="26" width="8" height="9" rx="2" fill="#cbf24d" />
        {/* The lid's underside, seen once it tips back. */}
        <path className="lc-lid-under" d="M9 30v-6a10 10 0 0 1 10-10h26a10 10 0 0 1 10 10v6z" fill="#0a0a0c" />
      </g>
    </svg>
  );
}
