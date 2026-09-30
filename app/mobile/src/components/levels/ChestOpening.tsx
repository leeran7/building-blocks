import { useEffect, useRef, useState, type CSSProperties } from "react";
import { POWER_UP_SPECS } from "@app/game/powerups";
import type { BoosterType } from "@app/levels/engagement";
import { notifySuccess, tapHeavy, tapLight, tapMedium } from "../../lib/haptics";
import { prefersReducedMotion } from "../../lib/motion";
import type { OpenedChest } from "../../lib/levels/model";
import { Button } from "../ui";
import { BoosterGlyph } from "./LevelIcons";

/**
 * The result card's star chest opening (design §6.4). Each chest a clear
 * opened waits closed, wobbling, light leaking from under its lid, until
 * tapped. Then it builds: three shakes, each harder than the last with its
 * own haptic, the seam burning brighter and light drawn in. The lid blows
 * open in a flash, a ring and a spray of sparks, and the boosters come out
 * face down, flipping over one at a time. Several chests play in turn, and
 * the run ends on the summary of everything received. Skip jumps straight
 * to that summary.
 *
 * Pure presentation: the server rolled the chests (`OpenedChest[]`), and
 * nothing here picks or reorders what they held. The sparks' angles come
 * from their index, never from Math.random. With reduced motion the chests
 * open at once and the summary shows directly.
 */

/** The build-up before the lid gives: three beats, each shaking harder. */
export const CHEST_SHAKE_MS = 1200;
const BEATS = 3;
/** The lid's flight and the light burst, before the boosters come out. */
export const CHEST_LID_MS = 600;
/** Between one booster card flipping over and the next. */
export const CHEST_CARD_STAGGER_MS = 380;
/** Sparks thrown out when the lid opens. */
export const CHEST_SPARKS = 14;
/** How far the sparks fly, in px (plus up to two 16px steps by index). */
const SPARK_REACH_PX = 58;
/** Motes of light drawn in to the chest while it shakes. */
const MOTES = 8;
const BEAT_MS = CHEST_SHAKE_MS / BEATS;

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
  .lc-shake { transform-origin: 50% 90%; }
  .lc-beat-1 .lc-shake { animation: lcShake1 ${BEAT_MS / 2}ms linear infinite; }
  .lc-beat-2 .lc-shake { animation: lcShake2 ${BEAT_MS / 4}ms linear infinite; }
  .lc-beat-3 .lc-shake { animation: lcShake3 ${BEAT_MS / 6}ms linear infinite; }
  @keyframes lcShake1 { 0%,100% { transform: rotate(0); } 25% { transform: translateX(-2px) rotate(-4deg); } 75% { transform: translateX(2px) rotate(4deg); } }
  @keyframes lcShake2 { 0%,100% { transform: scale(1.05); } 25% { transform: translateX(-3px) rotate(-7deg) scale(1.06); } 75% { transform: translateX(3px) rotate(7deg) scale(1.06); } }
  @keyframes lcShake3 { 0%,100% { transform: translateY(-2px) scale(1.12); } 25% { transform: translate(-4px,-3px) rotate(-10deg) scale(1.14); } 75% { transform: translate(4px,-1px) rotate(10deg) scale(1.14); } }
  .lc-seam { opacity: 0.35; animation: lcSeam 1.8s ease-in-out infinite; }
  @keyframes lcSeam { 0%, 100% { opacity: 0.25; } 50% { opacity: 0.7; } }
  .lc-beat-1 .lc-seam { animation: none; opacity: 0.6; }
  .lc-beat-2 .lc-seam { animation: none; opacity: 0.85; }
  .lc-beat-3 .lc-seam { animation: none; opacity: 1; }
  .lc-beat-1 .lc-glow { animation: none; opacity: 0.55; transform: scale(1.05); transition: all ${BEAT_MS}ms ease-in; }
  .lc-beat-2 .lc-glow { animation: none; opacity: 0.8; transform: scale(1.25); transition: all ${BEAT_MS}ms ease-in; }
  .lc-beat-3 .lc-glow { animation: none; opacity: 1; transform: scale(1.5); transition: all ${BEAT_MS}ms ease-in; }
  .lc-mote { animation: lcMote 700ms cubic-bezier(.6,0,.9,.5) infinite; }
  @keyframes lcMote { from { transform: translate(var(--mx), var(--my)); opacity: 0; } 30% { opacity: 1; } to { transform: translate(0, 0) scale(0.2); opacity: 0; } }
  .lc-flash { animation: lcFlash ${CHEST_LID_MS}ms ease-out both; }
  @keyframes lcFlash { 0% { opacity: 0; } 10% { opacity: 0.85; } 100% { opacity: 0; } }
  .lc-ring { animation: lcRing ${CHEST_LID_MS}ms cubic-bezier(.1,.7,.3,1) both; }
  @keyframes lcRing { from { transform: scale(0.3); opacity: 1; } to { transform: scale(2.4); opacity: 0; } }
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
  /* Dealt face down, a beat of suspense, then flipped face up with a pop.
     No opacity here: it would flatten the 3D and show the front mirrored. */
  .lc-card { transform-style: preserve-3d; animation: lcCard 900ms cubic-bezier(.3,1.2,.4,1) both; }
  @keyframes lcCard {
    0% { transform: translateY(26px) rotateY(180deg) scale(0.4); }
    18% { transform: translateY(0) rotateY(180deg) scale(1); }
    42% { transform: rotateY(180deg) scale(1.04); }
    82% { transform: rotateY(-8deg) scale(1.12); }
    100% { transform: rotateY(0) scale(1); }
  }
  .lc-face { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
  .lc-back { transform: rotateY(180deg); backface-visibility: hidden; -webkit-backface-visibility: hidden; }
  @media (prefers-reduced-motion: reduce) {
    .lc-wobble, .lc-glow, .lc-glow-on, .lc-shake, .lc-seam, .lc-lid-fly, .lc-lid-fly .lc-lid-under, .lc-rays, .lc-card, .lc-flash, .lc-ring { animation: none; }
    .lc-spark, .lc-mote, .lc-back { display: none; }
  }
`;

type Phase = "closed" | "shaking" | "opening" | "open" | "summary";

/** The result card's opening of the chests a clear opened. */
export function ChestReveal({
  chests,
  onCollect,
}: {
  chests: readonly OpenedChest[];
  /** Collect Rewards on the summary: the result card folds the chest away. */
  onCollect?: () => void;
}) {
  const [reduced] = useState(prefersReducedMotion);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>(reduced ? "summary" : "closed");
  const [beat, setBeat] = useState(1);
  const rootRef = useRef<HTMLDivElement>(null);
  const firstPhase = useRef(true);
  // The live region mounts empty and fills after, or a screen reader would
  // not announce it (reduced motion starts on the summary).
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);

  // The build-up: the shake grows in three beats, a harder haptic on each
  // (the tap that started it was the first).
  useEffect(() => {
    if (phase !== "shaking") return;
    const t2 = setTimeout(() => {
      setBeat(2);
      void tapMedium();
    }, BEAT_MS);
    const t3 = setTimeout(() => {
      setBeat(3);
      void tapHeavy();
    }, BEAT_MS * 2);
    return () => [t2, t3].forEach(clearTimeout);
  }, [phase]);

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
    setBeat(1);
    setPhase("shaking");
  };
  const next = () => {
    void tapMedium();
    setIndex(index + 1);
    setBeat(1);
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
        <ChestSummary chests={chests} onCollect={onCollect} />
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
          {/* On the last chest, open, See rewards does what Skip would. */}
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
              <ChestStage key={chest.chestNumber} phase={phase} beat={beat} chestNumber={chest.chestNumber} />
              <span className="flex items-baseline gap-2">
                <span className="font-display text-lead font-black uppercase text-signal">Star chest!</span>
                <span className="text-meta text-text-secondary">Tap to open</span>
              </span>
            </button>
          ) : (
            <div className="mx-auto flex flex-col items-center px-4">
              <ChestStage key={chest.chestNumber} phase={phase} beat={beat} chestNumber={chest.chestNumber} />
              <span className="font-display text-lead font-black uppercase text-signal">
                {phase === "shaking" ? ["Something's inside…", "It's waking up…", "Here it comes!"][beat - 1] : "Chest opened!"}
              </span>
            </div>
          )}
          {phase === "opening" && <span aria-hidden className="lc-flash pointer-events-none absolute inset-0 rounded-2xl bg-white" />}
          {phase === "open" && (
            <>
              <ul aria-label={`Boosters from chest ${index + 1}`} className="lc-cards mt-2 flex flex-wrap justify-center gap-2">
                {chest.boosters.map((type, i) => (
                  <BoosterCard key={i} type={type} delayMs={i * CHEST_CARD_STAGGER_MS} />
                ))}
              </ul>
              <button
                type="button"
                onClick={last ? toSummary : next}
                className="mt-2 min-h-[44px] w-full rounded-xl border border-signal/50 bg-signal/15 px-4 font-mono text-label font-bold uppercase tracking-label text-signal transition-transform active:scale-95"
              >
                {last ? "See rewards" : `Open chest ${index + 2} of ${chests.length}`}
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

/** The folded chest after Collect Rewards: one line of what was added. */
export function ChestCollected({ chests }: { chests: readonly OpenedChest[] }) {
  return (
    <p role="status" className="mt-4 text-center text-meta text-text-secondary">
      Added to your boosters:{" "}
      {chestTotals(chests).map(({ type, n }, i) => (
        <span key={type} className="font-bold" style={{ color: POWER_UP_SPECS[type].color }}>
          {i > 0 && <span className="text-text-secondary">, </span>}+{n} {POWER_UP_SPECS[type].label}
        </span>
      ))}
    </p>
  );
}

/** What the live region says once everything is out. */
function summaryLine(chests: readonly OpenedChest[]): string {
  const got = chestTotals(chests).map(({ type, n }) => `+${n} ${POWER_UP_SPECS[type].label}`);
  return `${summaryTitle(chests)} ${got.join(", ")}`;
}

/**
 * The reveal's last word: the chest standing open in its light, every
 * booster received as a tile, and Collect Rewards.
 */
function ChestSummary({ chests, onCollect }: { chests: readonly OpenedChest[]; onCollect?: () => void }) {
  return (
    <div className="lc-pop mt-5 text-center">
      <div className="flex items-center gap-3" role="presentation">
        <span aria-hidden className="h-px flex-1 bg-white/15" />
        <p className="font-display text-headline font-black uppercase tracking-wide text-text-primary">
          {chests.length === 1 ? "Star chest" : `${chests.length} star chests`}
        </p>
        <span aria-hidden className="h-px flex-1 bg-white/15" />
      </div>
      <span aria-hidden className="pointer-events-none relative mx-auto mt-1 flex h-28 w-28 items-center justify-center">
        <span className="lc-glow-still absolute inset-1 rounded-full" />
        <span className="lc-rays-still absolute -inset-4 rounded-full" />
        <span className="relative inline-flex">
          <BigChest lid="open" />
        </span>
      </span>
      <p className="font-mono text-label font-bold uppercase tracking-eyebrow text-text-secondary">Your rewards</p>
      <ul aria-label="Boosters from the chest" className="mt-2 grid grid-cols-2 gap-2.5">
        {chestTotals(chests).map(({ type, n }) => {
          const spec = POWER_UP_SPECS[type];
          return (
            <li
              key={type}
              className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 bg-elevated px-2 py-3"
              style={{ borderColor: spec.color, boxShadow: `0 0 16px -6px ${spec.color}` }}
            >
              <BoosterGlyph type={type} size={40} />
              <span className="text-body font-bold text-text-primary">
                +{n} {spec.label}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2.5 text-meta text-text-secondary">Use these from a level&rsquo;s start screen.</p>
      {onCollect && (
        <Button onPress={onCollect} className="mt-4 min-h-[56px] text-cta">
          Collect rewards
        </Button>
      )}
      <style>{`
        .lc-pop { animation: lcPop 420ms cubic-bezier(.2,1.4,.4,1) both; }
        @keyframes lcPop { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .lc-glow-still { background: radial-gradient(circle, rgba(203,242,77,0.5), transparent 70%); }
        .lc-rays-still {
          background: repeating-conic-gradient(rgba(203,242,77,0.3) 0deg 8deg, transparent 8deg 24deg);
          -webkit-mask-image: radial-gradient(circle, #000 15%, transparent 68%);
          mask-image: radial-gradient(circle, #000 15%, transparent 68%);
        }
        @media (prefers-reduced-motion: reduce) { .lc-pop { animation: none; } }
      `}</style>
    </div>
  );
}

/** One booster out of the chest: a card in its power-up's colour. */
function BoosterCard({ type, delayMs }: { type: BoosterType; delayMs: number }) {
  const spec = POWER_UP_SPECS[type];
  return (
    <li
      className="lc-card relative flex min-w-[96px] items-center justify-center gap-1.5 rounded-xl border-2 bg-elevated px-3 py-2"
      style={{ borderColor: spec.color, boxShadow: `0 0 18px -4px ${spec.color}`, animationDelay: `${delayMs}ms` }}
    >
      <span aria-hidden className="lc-face inline-flex">
        <BoosterGlyph type={type} size={18} />
      </span>
      <span className="lc-face text-meta font-bold" style={{ color: spec.color }}>
        {spec.label}
      </span>
      {/* The card's back, seen while it is dealt face down. */}
      <span aria-hidden className="lc-back absolute -inset-[2px] flex items-center justify-center rounded-xl border-2 border-signal bg-[#24222c]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="#cbf24d">
          <path d="m12 2 2.6 6.9L22 9.3l-5.8 4.6 2 7.1L12 17l-6.2 4 2-7.1L2 9.3l7.4-.4z" />
        </svg>
      </span>
    </li>
  );
}

/**
 * Where a spark flies: evenly round the circle, nudged by the chest number
 * so consecutive chests don't burst identically. Deterministic by design.
 */
function sparkOffset(i: number, chestNumber: number): { dx: number; dy: number } {
  const deg = (360 / CHEST_SPARKS) * i + ((chestNumber * 17) % 45) - 90;
  const reach = SPARK_REACH_PX + (i % 3) * 16;
  const rad = (deg * Math.PI) / 180;
  return { dx: Math.round(Math.cos(rad) * reach), dy: Math.round(Math.sin(rad) * reach) };
}

/** Where charge mote `i` starts before it is drawn into the chest. */
function moteStart(i: number): { mx: number; my: number } {
  const rad = ((360 / MOTES) * i + 20) * (Math.PI / 180);
  const reach = 64 + (i % 2) * 14;
  return { mx: Math.round(Math.cos(rad) * reach), my: Math.round(Math.sin(rad) * reach) };
}

/** The big chest with its glow, rays and sparks, animated by phase. */
function ChestStage({ phase, beat, chestNumber }: { phase: Exclude<Phase, "summary">; beat: number; chestNumber: number }) {
  const opened = phase === "opening" || phase === "open";
  return (
    <span
      aria-hidden
      data-chest-phase={phase}
      data-chest-beat={phase === "shaking" ? beat : undefined}
      className={`pointer-events-none relative flex h-24 w-24 items-center justify-center [@media(max-height:700px)]:h-[60px] [@media(max-height:700px)]:w-[60px] ${
        phase === "shaking" ? `lc-beat-${beat}` : ""
      }`}
    >
      <span className={`lc-glow absolute inset-2 rounded-full ${opened ? "lc-glow-on" : ""}`} />
      {opened && <span className="lc-rays absolute -inset-6 rounded-full" />}
      {phase === "shaking" &&
        Array.from({ length: MOTES }, (_, i) => {
          const { mx, my } = moteStart(i);
          return (
            <span
              key={i}
              className="lc-mote absolute left-1/2 top-1/2 -ml-[3px] -mt-[3px] h-1.5 w-1.5 rounded-full bg-signal"
              style={{ "--mx": `${mx}px`, "--my": `${my}px`, animationDelay: `${(i % 4) * 90}ms` } as CSSProperties}
            />
          );
        })}
      {phase === "opening" && <span className="lc-ring absolute inset-3 rounded-full border-4 border-signal" />}
      {phase === "opening" &&
        Array.from({ length: CHEST_SPARKS }, (_, i) => {
          const { dx, dy } = sparkOffset(i, chestNumber);
          return (
            <span
              key={i}
              className={`lc-spark absolute left-1/2 top-1/2 rounded-full ${i % 2 ? "-ml-1 -mt-1 h-2 w-2 bg-white" : "-ml-1.5 -mt-1.5 h-3 w-3 bg-signal"}`}
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
      {/* Light leaking through the seam while the lid is still shut. */}
      {lid === "closed" && <rect className="lc-seam" x="7" y="28.5" width="50" height="3" rx="1.5" fill="#f4ffc8" style={{ filter: "blur(1.2px)" }} />}
    </svg>
  );
}
