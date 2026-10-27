"use client";

/**
 * TowerScene — the hero's pinned, scroll-scrubbed climb (decorative).
 *
 * The page is the climb: AscentTrack pins this scene while you scroll, and
 * scroll progress is the playhead. Your climber (the Kestrel's Void skin, its
 * real game sheets) goes up the ladder one strip frame per CLIMB_M_PER_FRAME
 * metres, a rival trails on the next ladder, the volcano wall parallaxes
 * behind, and the lava chases: stop scrolling and it creeps up to your feet,
 * scroll and you pull away (stepLavaGap). At the top the climber celebrates.
 *
 * Distances use container-query units: the scene is a size container and one
 * metre is 100 / VIEW_M cqh, so the tower scales with whatever box it gets.
 * aria-hidden: everything it says, the hero's pitch already says in text.
 * Reduced motion: AscentTrack does not pin, progress stays 0, the lava holds.
 */

import { useRef, useState } from "react";
import {
  motion,
  useAnimationFrame,
  useMotionTemplate,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
  type MotionValue,
} from "motion/react";
import { useReducedMotionAfterMount } from "./useReducedMotionAfterMount";
import { ALTITUDE_UNIT } from "../../../lib/units";
import {
  BASEMENT_FLOORS,
  CLIMBER_FEET_FROM_BOTTOM,
  CLIMB_FRAMES,
  FLOOR_M,
  LAVA_GAP_START,
  LAVA_WARN_GAP,
  SUMMIT_AT,
  VIEW_M,
  climbFrame,
  climbMetres,
  floorAt,
  stepLavaGap,
  towerFloors,
} from "./landingMotion";

const M = 100 / VIEW_M; // cqh per metre
const HERO_SKIN = "kestrel-void";
const RIVAL_SKIN = "ibex";

/** Deterministic ember layout (no Math.random: SSR and client must agree). */
const EMBERS = Array.from({ length: 16 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  delay: ((i * 0.53) % 4).toFixed(2),
  dur: (3.2 + ((i * 0.71) % 2.6)).toFixed(2),
  size: 2 + (i % 3),
}));

function Climber({
  skin,
  frame,
  summit,
  className,
}: {
  skin: string;
  frame: MotionValue<number>;
  summit: boolean;
  className: string;
}) {
  const climbPos = useTransform(frame, (f) => `${(f / (CLIMB_FRAMES - 1)) * 100}% 0%`);
  return summit ? (
    // poses cell 6 (celebrate): column 2, row 1 of a 4×2 atlas
    <div
      className={className}
      style={{
        backgroundImage: `url(/climb/${skin}-poses-192.png)`,
        backgroundSize: "400% 200%",
        backgroundPosition: "66.667% 100%",
      }}
    />
  ) : (
    <motion.div
      className={className}
      style={{
        backgroundImage: `url(/climb/${skin}-climb-192.png)`,
        backgroundSize: `${CLIMB_FRAMES * 100}% 100%`,
        backgroundPosition: climbPos,
      }}
    />
  );
}

export function TowerScene({ progress }: { progress: MotionValue<number> }) {
  const reduce = useReducedMotionAfterMount();
  const climb = useTransform(progress, climbMetres);
  const frame = useTransform(climb, climbFrame);
  const rivalClimb = useSpring(useTransform(climb, (m) => Math.max(0, m * 0.9 - 2.5)), {
    stiffness: 60,
    damping: 18,
  });
  const rivalFrame = useTransform(rivalClimb, climbFrame);
  const rivalBehind = useMotionTemplate`calc(${useTransform(() => climb.get() - rivalClimb.get())} * ${M}cqh)`;

  // World moves down as you climb up; the volcano wall moves at 35 % (parallax).
  const worldY = useMotionTemplate`calc(${climb} * ${M}cqh)`;
  const wallY = useMotionTemplate`calc(${climb} * ${M * 0.35}cqh)`;

  // Lava chase, integrated per frame from scroll speed.
  const { scrollY } = useScroll();
  const speed = useVelocity(scrollY);
  const gap = useMotionValue(LAVA_GAP_START);
  const [summit, setSummit] = useState(false);
  const [warn, setWarn] = useState(false);
  useAnimationFrame((_, delta) => {
    if (reduce) return;
    const next = stepLavaGap(gap.get(), delta / 1000, speed.get(), progress.get() >= SUMMIT_AT);
    gap.set(next);
  });
  const smoothGap = useSpring(gap, { stiffness: 120, damping: 24 });
  const lavaTop = useTransform(smoothGap, (g) => `${(1 - (CLIMBER_FEET_FROM_BOTTOM - g)) * 100}%`);
  useMotionValueEvent(gap, "change", (g) => setWarn(g < LAVA_WARN_GAP && progress.get() < SUMMIT_AT));
  useMotionValueEvent(progress, "change", (p) => setSummit(p >= SUMMIT_AT));

  // HUD readouts write text directly: no React render per scroll frame.
  const altRef = useRef<HTMLSpanElement>(null);
  const floorRef = useRef<HTMLSpanElement>(null);
  useMotionValueEvent(climb, "change", (m) => {
    if (altRef.current) altRef.current.textContent = `${Math.round(m * 3.28)}`;
    if (floorRef.current) floorRef.current.textContent = String(floorAt(m)).padStart(2, "0");
  });

  const hintOpacity = useTransform(progress, [0, 0.06], [1, 0]);
  const floors = towerFloors();

  return (
    <div
      aria-hidden="true"
      className="tower-scene relative h-full w-full overflow-hidden bg-void [container-type:size]"
    >
      {/* volcano wall, parallax */}
      <motion.div
        className="tower-wall absolute inset-x-0 bottom-0 h-[400cqh]"
        style={{ y: wallY }}
      />
      <div className="absolute inset-0 bg-linear-to-b from-void/85 via-void/35 to-void/70" />

      {/* the tower: shaft, ladders, ledges, summit. World 0 m is the
          climber's feet at the start; basement floors sit under it. */}
      <motion.div
        className="absolute inset-x-0"
        style={{
          y: worldY,
          bottom: `${CLIMBER_FEET_FROM_BOTTOM * 100 - BASEMENT_FLOORS * FLOOR_M * M}cqh`,
          height: `${((BASEMENT_FLOORS + floors - 1) * FLOOR_M + 1.5) * M}cqh`,
        }}
      >
        <div className="tower-shaft absolute inset-y-0 left-[16%] right-[16%]" />
        <div className="tower-ladder absolute inset-y-0 left-[calc(50%-5.5cqh)] w-[11cqh]" />
        <div className="tower-ladder tower-ladder--rival absolute inset-y-0 left-[calc(76%-4cqh)] w-[8cqh]" />
        {Array.from({ length: BASEMENT_FLOORS + floors }, (_, k) => {
          const i = k - BASEMENT_FLOORS; // floor index, 0 = start
          const summitFloor = i === floors - 1;
          return (
            <div
              key={i}
              className="absolute inset-x-[12%] h-[2.2cqh]"
              style={{ bottom: `${(k * FLOOR_M) * M - 2.2}cqh` }}
            >
              <div className={"tower-ledge h-full " + (summitFloor ? "tower-ledge--summit" : i % 2 ? "tower-ledge--r" : "tower-ledge--l")} />
              {i >= 0 && (
                <span className="absolute top-[3cqh] left-[1cqh] font-mono text-[max(9px,2cqh)] uppercase tracking-[0.18em] text-text-muted">
                  {summitFloor ? "Top" : `F${String(i + 1).padStart(2, "0")}`}
                </span>
              )}
              {summitFloor && (
                <span className="tower-summit absolute -top-[7cqh] left-[calc(50%+9cqh)] h-[5cqh] w-[5cqh]" />
              )}
            </div>
          );
        })}
      </motion.div>

      {/* rival, a few metres behind on its own ladder */}
      <motion.div
        className="absolute left-[76%] -translate-x-1/2 opacity-70"
        style={{ bottom: `${CLIMBER_FEET_FROM_BOTTOM * 100}%`, y: rivalBehind }}
      >
        <span className="absolute -top-[3.4cqh] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-border-strong bg-void/80 px-[1.2cqh] font-mono text-[max(8px,1.8cqh)] uppercase tracking-[0.16em] text-text-secondary">
          Rival
        </span>
        <Climber skin={RIVAL_SKIN} frame={rivalFrame} summit={false} className="h-[13cqh] w-[13cqh] bg-no-repeat" />
      </motion.div>

      {/* you */}
      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{ bottom: `calc(${CLIMBER_FEET_FROM_BOTTOM * 100}% - 2.4cqh)` }}
      >
        <span className="absolute -top-[2.6cqh] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-signal px-[1.2cqh] font-mono text-[max(8px,1.8cqh)] font-bold uppercase tracking-[0.16em] text-void">
          You
        </span>
        <Climber
          skin={HERO_SKIN}
          frame={frame}
          summit={summit}
          className={"tower-climber h-[19cqh] w-[19cqh] bg-no-repeat " + (summit ? "tower-climber--summit" : "")}
        />
      </div>

      {/* lava: crest + molten body; keeps the shared ground-rise glow */}
      <motion.div className="absolute inset-x-0 bottom-0" style={{ top: lavaTop }}>
        <div className="tower-lava-crest absolute inset-x-0 -top-[3cqh] h-[4cqh]" />
        <div className="tower-lava absolute inset-0" />
        <div className="ground-gradient animate-groundRise absolute inset-x-0 -top-[14cqh] h-[14cqh] opacity-60" />
        {EMBERS.map((e, i) => (
          <span
            key={i}
            className="tower-ember absolute top-0 rounded-full bg-ember"
            style={{
              left: `${e.left}%`,
              width: e.size,
              height: e.size,
              animationDelay: `${e.delay}s`,
              animationDuration: `${e.dur}s`,
            }}
          />
        ))}
      </motion.div>

      {/* HUD */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between p-[2.4cqh] font-mono uppercase">
        <div className="rounded-lg border border-border-strong bg-void/70 px-[1.6cqh] py-[0.9cqh] backdrop-blur-sm">
          <div className="text-[max(9px,1.7cqh)] tracking-[0.18em] text-text-muted">Altitude</div>
          <div className="text-[max(16px,4.2cqh)] font-bold leading-none tabular-nums text-signal">
            <span ref={altRef}>0</span>
            <span className="text-[0.5em] text-text-muted">{ALTITUDE_UNIT}</span>
          </div>
        </div>
        <div className="rounded-lg border border-border-strong bg-void/70 px-[1.6cqh] py-[0.9cqh] text-right backdrop-blur-sm">
          <div className="text-[max(9px,1.7cqh)] tracking-[0.18em] text-text-muted">Floor</div>
          <div className="text-[max(16px,4.2cqh)] font-bold leading-none tabular-nums text-text-primary">
            <span ref={floorRef}>01</span>
          </div>
        </div>
      </div>

      {/* prompts */}
      <motion.div
        className="absolute inset-x-0 top-[16cqh] flex justify-center motion-reduce:hidden"
        style={{ opacity: hintOpacity }}
      >
        <span className="tower-hint rounded-full border border-signal/40 bg-void/75 px-[2cqh] py-[0.8cqh] font-mono text-[max(10px,1.9cqh)] uppercase tracking-[0.2em] text-signal">
          Scroll to climb ↓
        </span>
      </motion.div>
      <div
        className={
          "absolute inset-x-0 bottom-[5cqh] flex justify-center transition-[opacity,transform] duration-300 " +
          (warn ? "opacity-100 translate-y-0" : "pointer-events-none translate-y-2 opacity-0")
        }
      >
        <span className="tower-warn rounded-full bg-ember px-[2cqh] py-[0.9cqh] font-mono text-[max(10px,1.9cqh)] font-bold uppercase tracking-[0.18em] text-void">
          ▲ Lava! Keep scrolling
        </span>
      </div>
      <div
        className={
          "absolute inset-x-0 top-[24cqh] flex justify-center transition-[opacity,transform] duration-500 " +
          (summit ? "scale-100 opacity-100" : "scale-75 opacity-0")
        }
      >
        <span className="tower-summit-banner font-display text-[max(28px,9cqh)] uppercase leading-none text-signal-glow">
          Summit
        </span>
      </div>
    </div>
  );
}
