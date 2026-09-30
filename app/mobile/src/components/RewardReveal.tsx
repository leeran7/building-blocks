import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { notifySuccess, tapHeavy, tapLight, tapMedium } from "../lib/haptics";
import { prefersReducedMotion } from "../lib/motion";
import { GemIcon } from "./store/GemIcon";

/**
 * The payoff after a purchase (a skin, a character, a lives refill, a gem
 * pack): a full-screen moment that builds before it gives. The prize waits
 * as a dark silhouette while light gathers and the stage shakes harder in
 * three beats (a haptic each), then it bursts: a flash, a ring, sparks, the
 * prize in full colour on spinning rays, and the headline rising in.
 *
 * Pure presentation: it runs after the server has already said yes, and
 * nothing here decides what was bought. The sparks' angles come from their
 * index, never from Math.random. With reduced motion it opens on the reveal.
 */

/** The build-up before the burst: three rising beats. */
export const REVEAL_CHARGE_MS = 1350;
/** The burst: flash, ring and sparks, before the headline settles. */
export const REVEAL_BURST_MS = 650;
/** Beats in the build-up, each shaking harder with its own haptic. */
const BEATS = 3;
/** Sparks thrown out by the burst. */
export const REVEAL_SPARKS = 16;
/** Motes drawn in toward the prize while it charges. */
const MOTES = 12;

export type RevealPhase = "charge" | "burst" | "shown";

export interface RewardRevealProps {
  /** The prize itself, drawn big: a character, hearts, a pile of gems. */
  subject: ReactNode;
  /** "New skin unlocked" */
  eyebrow: string;
  /** "Void Kestrel" */
  title: string;
  /** One line under the title: "Equipped. Forged in the dark between climbs." */
  detail?: string;
  /** Gems this cost; shown draining into the prize while it charges. */
  spent?: number | null;
  /** A number that counts up on the reveal (a new gem balance). */
  countUp?: { from: number; to: number; suffix: string } | null;
  /** The prize's colour: the glow, the rays and the sparks. */
  accent?: string;
  /** What the button says ("Continue"). */
  doneLabel?: string;
  onDone: () => void;
}

const REVEAL_CSS = `
  .rr-scrim { animation: rrFade 240ms ease-out both; }
  @keyframes rrFade { from { opacity: 0; } to { opacity: 1; } }
  .rr-stage { transform-origin: 50% 80%; }
  .rr-beat-1 { animation: rrShake1 ${REVEAL_CHARGE_MS / BEATS}ms linear infinite; }
  .rr-beat-2 { animation: rrShake2 ${REVEAL_CHARGE_MS / BEATS / 2}ms linear infinite; }
  .rr-beat-3 { animation: rrShake3 ${REVEAL_CHARGE_MS / BEATS / 4}ms linear infinite; }
  @keyframes rrShake1 { 0%,100% { transform: translate(0,0) rotate(0); } 25% { transform: translate(-2px,0) rotate(-1.5deg); } 75% { transform: translate(2px,0) rotate(1.5deg); } }
  @keyframes rrShake2 { 0%,100% { transform: translate(0,0) rotate(0) scale(1.02); } 25% { transform: translate(-4px,-1px) rotate(-3deg) scale(1.03); } 75% { transform: translate(4px,1px) rotate(3deg) scale(1.03); } }
  @keyframes rrShake3 { 0%,100% { transform: translate(0,0) rotate(0) scale(1.06); } 25% { transform: translate(-6px,-2px) rotate(-5deg) scale(1.08); } 75% { transform: translate(6px,1px) rotate(5deg) scale(1.08); } }
  .rr-silhouette { filter: brightness(0) drop-shadow(0 0 10px var(--rr-accent)); transition: filter 380ms ease-out; }
  .rr-lit { filter: brightness(1) drop-shadow(0 0 22px var(--rr-accent)); }
  .rr-halo { background: radial-gradient(circle, var(--rr-accent-soft), transparent 68%); }
  .rr-charging .rr-halo { animation: rrSwell ${REVEAL_CHARGE_MS}ms cubic-bezier(.5,0,.9,.6) both; }
  @keyframes rrSwell { from { opacity: 0.15; transform: scale(0.55); } to { opacity: 1; transform: scale(1.25); } }
  .rr-mote { animation: rrMote 900ms cubic-bezier(.6,0,.9,.5) infinite; }
  @keyframes rrMote { from { transform: translate(var(--mx), var(--my)) scale(1); opacity: 0; } 30% { opacity: 1; } to { transform: translate(0,0) scale(0.2); opacity: 0; } }
  .rr-flash { animation: rrFlash ${REVEAL_BURST_MS}ms ease-out both; }
  @keyframes rrFlash { 0% { opacity: 0; } 12% { opacity: 0.95; } 100% { opacity: 0; } }
  .rr-ring { animation: rrRing ${REVEAL_BURST_MS}ms cubic-bezier(.1,.7,.3,1) both; border-color: var(--rr-accent); }
  @keyframes rrRing { from { transform: scale(0.2); opacity: 1; } to { transform: scale(2.6); opacity: 0; } }
  .rr-spark { animation: rrSpark ${REVEAL_BURST_MS + 250}ms cubic-bezier(.1,.7,.3,1) both; background: var(--rr-accent); }
  @keyframes rrSpark { from { transform: translate(0,0) scale(1.4); opacity: 1; } to { transform: translate(var(--dx), var(--dy)) scale(0.2); opacity: 0; } }
  .rr-rays {
    background: repeating-conic-gradient(var(--rr-accent-soft) 0deg 9deg, transparent 9deg 24deg);
    -webkit-mask-image: radial-gradient(circle, #000 18%, transparent 68%);
    mask-image: radial-gradient(circle, #000 18%, transparent 68%);
    animation: rrRays 14s linear infinite, rrFade 500ms ease-out both;
  }
  @keyframes rrRays { to { transform: rotate(360deg); } }
  .rr-pop { animation: rrPop 520ms cubic-bezier(.2,1.5,.4,1) both; }
  @keyframes rrPop { from { transform: scale(0.6); } to { transform: scale(1); } }
  .rr-rise { animation: rrRise 480ms cubic-bezier(.16,1,.3,1) both; }
  @keyframes rrRise { from { transform: translateY(18px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  .rr-drain { animation: rrDrain ${REVEAL_CHARGE_MS}ms cubic-bezier(.5,0,.8,.4) both; }
  @keyframes rrDrain { 0% { transform: translateY(0) scale(1); opacity: 1; } 70% { opacity: 1; } 100% { transform: translateY(150px) scale(0.3); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) {
    .rr-scrim, .rr-beat-1, .rr-beat-2, .rr-beat-3, .rr-mote, .rr-flash, .rr-ring, .rr-spark, .rr-rays, .rr-pop, .rr-rise, .rr-drain, .rr-charging .rr-halo { animation: none; }
    .rr-silhouette { transition: none; }
  }
`;

/** Where burst spark `i` flies: evenly round the circle, two reaches. */
export function revealSparkOffset(i: number): { dx: number; dy: number } {
  const rad = ((360 / REVEAL_SPARKS) * i - 90) * (Math.PI / 180);
  const reach = 120 + (i % 2) * 44;
  return { dx: Math.round(Math.cos(rad) * reach), dy: Math.round(Math.sin(rad) * reach) };
}

/** Where charge mote `i` starts before it is drawn into the prize. */
function moteStart(i: number): { mx: number; my: number } {
  const rad = ((360 / MOTES) * i + 15) * (Math.PI / 180);
  const reach = 150 + (i % 3) * 22;
  return { mx: Math.round(Math.cos(rad) * reach), my: Math.round(Math.sin(rad) * reach) };
}

export function RewardReveal({
  subject,
  eyebrow,
  title,
  detail,
  spent = null,
  countUp = null,
  accent = "#cbf24d",
  doneLabel = "Continue",
  onDone,
}: RewardRevealProps) {
  const [reduced] = useState(prefersReducedMotion);
  const [phase, setPhase] = useState<RevealPhase>(reduced ? "shown" : "charge");
  const [beat, setBeat] = useState(1);
  const doneRef = useRef<HTMLButtonElement>(null);

  // Three beats, each harder, then the burst, then the reveal.
  useEffect(() => {
    if (phase === "charge") {
      void tapLight();
      const step = REVEAL_CHARGE_MS / BEATS;
      const t2 = setTimeout(() => {
        setBeat(2);
        void tapMedium();
      }, step);
      const t3 = setTimeout(() => {
        setBeat(3);
        void tapHeavy();
      }, step * 2);
      const burst = setTimeout(() => {
        void notifySuccess();
        setPhase("burst");
      }, REVEAL_CHARGE_MS);
      return () => [t2, t3, burst].forEach(clearTimeout);
    }
    if (phase === "burst") {
      const t = setTimeout(() => setPhase("shown"), REVEAL_BURST_MS);
      return () => clearTimeout(t);
    }
    doneRef.current?.focus();
    return undefined;
  }, [phase]);

  const lit = phase !== "charge";
  const style = { "--rr-accent": accent, "--rr-accent-soft": `${accent}66` } as CSSProperties;
  // A tap during the build-up jumps to the reveal (never a trap).
  const skip = () => {
    if (phase === "charge") setPhase("burst");
  };

  // Portalled to the body: screens sit in a stacking context under the tab
  // bar, and the reveal must cover everything.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${eyebrow}: ${title}`}
      data-reward-phase={phase}
      style={style}
      onClick={skip}
      className={`rr-scrim fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden bg-void/90 px-6 backdrop-blur-md ${
        phase === "charge" ? "rr-charging" : ""
      }`}
    >
      <p role="status" className="sr-only">
        {phase === "shown" ? `${eyebrow}: ${title}` : ""}
      </p>
      <div aria-hidden className="relative flex h-72 w-72 items-center justify-center">
        <span className="rr-halo absolute inset-0 rounded-full" />
        {lit && <span className="rr-rays absolute -inset-16 rounded-full" />}
        {phase === "charge" &&
          Array.from({ length: MOTES }, (_, i) => {
            const { mx, my } = moteStart(i);
            return (
              <span
                key={i}
                className="rr-mote absolute left-1/2 top-1/2 -ml-1 -mt-1 h-2 w-2 rounded-full"
                style={{ "--mx": `${mx}px`, "--my": `${my}px`, background: accent, animationDelay: `${(i % 4) * 110}ms` } as CSSProperties}
              />
            );
          })}
        {phase === "burst" && (
          <>
            <span className="rr-ring absolute inset-16 rounded-full border-4" />
            {Array.from({ length: REVEAL_SPARKS }, (_, i) => {
              const { dx, dy } = revealSparkOffset(i);
              return (
                <span
                  key={i}
                  className="rr-spark absolute left-1/2 top-1/2 -ml-1.5 -mt-1.5 h-3 w-3 rounded-full"
                  style={{ "--dx": `${dx}px`, "--dy": `${dy}px`, animationDelay: `${(i % 3) * 30}ms` } as CSSProperties}
                />
              );
            })}
          </>
        )}
        <span className={`rr-stage relative inline-flex ${phase === "charge" ? `rr-beat-${beat}` : lit ? "rr-pop" : ""}`}>
          <span className={`inline-flex ${lit ? "rr-silhouette rr-lit" : "rr-silhouette"}`}>{subject}</span>
        </span>
        {phase === "charge" && spent !== null && (
          <span className="rr-drain absolute -top-10 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap font-display text-headline font-black tabular-nums text-signal">
            <GemIcon size={26} />−{spent.toLocaleString("en-US")}
          </span>
        )}
      </div>

      <div className="mt-4 flex min-h-[176px] w-full max-w-sm flex-col items-center text-center">
        {phase === "charge" ? (
          <p className="animate-pulse font-mono text-label font-bold uppercase tracking-eyebrow text-text-secondary">Unlocking…</p>
        ) : (
          <>
            <p className="rr-rise font-mono text-label font-bold uppercase tracking-eyebrow" style={{ color: accent }}>
              {eyebrow}
            </p>
            <h2 className="rr-rise mt-1 font-display text-title font-black uppercase leading-none tracking-tight text-text-primary" style={{ animationDelay: "80ms" }}>
              {title}
            </h2>
            {countUp && <CountUp {...countUp} run={phase === "shown" && !reduced} />}
            {detail && (
              <p className="rr-rise mt-2 text-body text-text-secondary" style={{ animationDelay: "160ms" }}>
                {detail}
              </p>
            )}
            {phase === "shown" && (
              <button
                ref={doneRef}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void tapLight();
                  onDone();
                }}
                className="rr-rise cta-lime mt-6 flex min-h-[56px] w-full items-center justify-center rounded-2xl font-display text-lead font-black uppercase tracking-wide text-void transition-transform active:scale-[0.98]"
                style={{ animationDelay: "240ms" }}
              >
                {doneLabel}
              </button>
            )}
          </>
        )}
      </div>
      {phase === "burst" && <span aria-hidden className="rr-flash pointer-events-none absolute inset-0 bg-white" />}
      <style>{REVEAL_CSS}</style>
    </div>,
    document.body,
  );
}

/** A number rolling up from `from` to `to` over about a second. */
function CountUp({ from, to, suffix, run }: { from: number; to: number; suffix: string; run: boolean }) {
  const [value, setValue] = useState(run ? from : to);
  useEffect(() => {
    if (!run) {
      setValue(to);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 1000);
      setValue(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, run]);
  return (
    <p className="rr-rise mt-3 flex items-center gap-2 font-display text-headline font-black tabular-nums text-text-primary" style={{ animationDelay: "120ms" }}>
      <GemIcon size={26} />
      {value.toLocaleString("en-US")} {suffix}
    </p>
  );
}

/** A pile of gems for the gem pack reveal. */
export function GemPile({ size = 150 }: { size?: number }) {
  return (
    <span className="relative inline-block" style={{ width: size, height: size }}>
      <span className="absolute left-[28%] top-[4%]"><GemIcon size={size * 0.5} /></span>
      <span className="absolute left-[2%] top-[40%]"><GemIcon size={size * 0.42} /></span>
      <span className="absolute left-[54%] top-[38%]"><GemIcon size={size * 0.44} /></span>
    </span>
  );
}

/** Hearts for the lives refill reveal, filling one after another once lit. */
export function HeartRow({ count }: { count: number }) {
  return (
    <span className="flex gap-1.5">
      {Array.from({ length: count }, (_, i) => (
        <svg key={i} width="48" height="48" viewBox="0 0 24 24" fill="#ff5a36" className="rr-pop" style={{ animationDelay: `${i * 90}ms` }}>
          <path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3 4.5 6.7 4.5c2.1 0 3.6 1.1 4.3 2.4.7-1.3 2.2-2.4 4.3-2.4 3.7 0 5.8 3.8 4.3 7.2C19.5 16.4 12 21 12 21z" />
        </svg>
      ))}
    </span>
  );
}
