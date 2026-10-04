import { useMemo } from "react";
import { CharacterPreview, PREVIEW_FOOT_PAD } from "../CharacterPreview";
import { StarRow } from "./LevelBits";
import { EPISODE_SIZE, isHardLevel, type LevelNode } from "../../lib/levels/model";
import type { EquippedAvatar } from "../../contexts/AppDataContext";
import {
  FIGURE_CANVAS_PX,
  FIGURE_PX,
  LADDER_W,
  LANDING_H,
  RAIL_TICK_W,
  RAIL_X,
  RUNG_PITCH,
  SLAB_H,
  SLAB_MAX_X,
  SLAB_MIN_X,
  SLAB_DEPTH_PX,
  SLAB_W,
  STAR_GAP_PX,
  STAR_PX,
  ladderSpans,
  ladderX,
  landingBottom,
  slabRange,
  slabTop,
  slabUnderside,
} from "./towerGeometry";

/** A broken ladder keeps its left rail outside this middle stretch, and its right rail below the top one. */
const BROKEN_GAP_FROM = 0.4;
const BROKEN_GAP_TO = 0.6;
const BROKEN_RIGHT_TO = 0.7;
/** The ladders' shadow offset: x in % of the map's width, y in px (down). */
const LADDER_SHADOW_X = 0.9;
const LADDER_SHADOW_Y = 4;

type FloorState = "open" | "current" | "locked";

/**
 * The level map drawn as the tower: slab floors climbing from level 1 at the
 * bottom, a ladder from each floor to the next (lit up to the frontier, dim
 * and broken above it), a landing at each episode boundary, an altimeter rail
 * up the left edge, and the player's character standing on the frontier floor.
 * `levels` is the shown floors from level 1; `floorsAbove` is how many lie
 * above them; `height` is the map's height (towerHeight of the top shown
 * floor), which the screen also scrolls by. The figure waits for `avatar` to
 * resolve, so a saved character never shows as the default one first.
 */
export function TowerMap({
  seasonName,
  levels,
  frontier,
  floorsAbove,
  height,
  avatar,
  onOpen,
}: {
  seasonName: string;
  levels: LevelNode[];
  frontier: number;
  floorsAbove: number;
  height: number;
  avatar: EquippedAvatar;
  onOpen: (node: LevelNode) => void;
}) {
  const top = levels.length;
  const playerFloor = avatar.loading ? null : frontier;
  const avatarId = avatar.loading ? null : avatar.avatarId;
  const landings = Math.floor((top - 1) / EPISODE_SIZE);

  return (
    <div
      className="relative mx-auto w-full max-w-md"
      style={{ height, ["--slab-depth" as string]: `${SLAB_DEPTH_PX}px` }}
    >
      <div
        aria-hidden
        className="altimeter pointer-events-none absolute inset-y-0 opacity-40"
        style={{ left: `${RAIL_X}%`, width: `${RAIL_TICK_W / 2}%` }}
      />
      <Structure top={top} frontier={frontier} height={height} />
      <ol aria-label={`${seasonName} levels`} className="absolute inset-0">
        {Array.from({ length: landings }, (_, i) => (
          <Landing key={`landing-${i + 2}`} episode={i + 2} />
        ))}
        {levels.map((node) => (
          <Floor
            key={node.level}
            node={node}
            state={floorState(node, frontier)}
            hasPlayer={node.level === playerFloor}
            tour={node.level === frontier}
            avatarId={avatarId}
            onOpen={onOpen}
          />
        ))}
        {floorsAbove > 0 && (
          <li
            aria-hidden
            className="absolute inset-x-0 top-0 flex h-32 items-start justify-center bg-gradient-to-b from-void to-transparent pt-24 font-mono text-label uppercase tracking-label text-text-muted"
          >
            {floorsAbove} more {floorsAbove === 1 ? "floor" : "floors"}
          </li>
        )}
      </ol>
    </div>
  );
}

function floorState(node: LevelNode, frontier: number): FloorState {
  if (node.level > frontier) return "locked";
  return node.level === frontier && node.stars === 0 ? "current" : "open";
}

function floorLabel(node: LevelNode, state: FloorState, hard: boolean): string {
  if (state === "locked") return `Level ${node.level}, locked`;
  const progress = node.stars > 0 ? `, ${node.stars} of 3 stars` : state === "current" ? ", next to play" : "";
  return `Level ${node.level}${hard ? ", hard" : ""}${progress}`;
}

/**
 * Slab blocks: the front face's classes, plus the top and side faces' colours
 * (.tower-slab in styles.css). The frontier is the lime one; a Hard floor is
 * ember until it is the frontier; an open floor's top is lit lime; a locked
 * floor is an unlit wireframe.
 */
const FACE_LOCKED = "tower-slab tower-slab-ghost border-border-strong bg-void/60 text-text-muted";
const FACE_CURRENT =
  "tower-slab border-signal bg-signal text-void [--slab-edge:0.55] [--slab-under:0.2] [--slab-top:color-mix(in_srgb,var(--color-signal)_65%,white)] [--slab-side:color-mix(in_srgb,var(--color-signal)_55%,black)] [--slab-rim:var(--color-signal)]";
const FACE_HARD =
  "tower-slab border-ember/60 border-t-ember bg-[color-mix(in_srgb,var(--color-ember)_16%,var(--color-surface))] text-text-primary [--slab-top:color-mix(in_srgb,var(--color-ember)_55%,var(--color-surface))] [--slab-side:color-mix(in_srgb,var(--color-ember)_22%,var(--color-void))] [--slab-rim:color-mix(in_srgb,var(--color-ember)_60%,transparent)]";
const FACE_OPEN =
  "tower-slab border-border-strong border-t-signal/70 bg-elevated text-text-primary [--slab-top:color-mix(in_srgb,var(--color-signal)_22%,var(--color-elevated))]";

function slabFace(state: FloorState, hard: boolean): string {
  if (state === "locked") return FACE_LOCKED;
  if (state === "current") return FACE_CURRENT;
  return hard ? FACE_HARD : FACE_OPEN;
}

/**
 * One level: a slab that is the whole tap target. `hasPlayer` stands the
 * player's character (`avatarId`; null is the default climber) on it.
 */
function Floor({
  node,
  state,
  hasPlayer,
  tour,
  avatarId,
  onOpen,
}: {
  node: LevelNode;
  state: FloorState;
  hasPlayer: boolean;
  /** The floor the first-run tour points at. */
  tour: boolean;
  avatarId: string | null;
  onOpen: (node: LevelNode) => void;
}) {
  const hard = isHardLevel(node.level);
  const locked = state === "locked";
  const current = state === "current";

  return (
    <li
      className="absolute"
      style={{
        left: `${slabRange(node.level).left}%`,
        width: `${SLAB_W}%`,
        bottom: slabUnderside(node.level),
        height: SLAB_H,
      }}
    >
      {hasPlayer && (
        <span
          aria-hidden
          data-you-marker
          className="pointer-events-none absolute left-1/2 z-10 flex -translate-x-1/2"
          style={{ bottom: `calc(100% - ${PREVIEW_FOOT_PAD}px)` }}
        >
          <CharacterPreview
            avatarId={avatarId}
            pose="idle"
            locked={false}
            figurePx={FIGURE_PX}
            sizePx={FIGURE_CANVAS_PX}
            ambient
          />
        </span>
      )}
      <button
        type="button"
        disabled={locked}
        data-tour={tour ? "next-level" : undefined}
        aria-label={floorLabel(node, state, hard)}
        aria-current={current ? "step" : undefined}
        onClick={() => onOpen(node)}
        className={`relative flex h-full w-full items-center justify-center gap-1.5 border pb-1 font-display font-black tabular-nums transition-transform active:scale-[0.97] disabled:active:scale-100 ${current ? "text-headline" : "text-lead"} ${slabFace(state, hard)}`}
      >
        {locked ? (
          <>
            <LockIcon />
            <span className="font-mono text-label font-bold">{node.level}</span>
          </>
        ) : (
          node.level
        )}
        {hard && !locked && (
          <span
            aria-hidden
            className={`absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-ember ${current ? "border-2 border-void" : ""}`}
          >
            <SkullIcon />
          </span>
        )}
      </button>
      {!locked && node.stars > 0 && (
        <span
          data-floor-stars
          className="pointer-events-none absolute left-1/2 flex -translate-x-1/2"
          style={{ top: `calc(100% + ${STAR_GAP_PX}px)` }}
        >
          <StarRow count={node.stars} size={STAR_PX} className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
        </span>
      )}
    </li>
  );
}

/** An episode boundary: a full-width floor carrying the episode it opens. */
function Landing({ episode }: { episode: number }) {
  return (
    <li
      aria-hidden
      data-landing
      className="tower-slab absolute flex items-center justify-center border border-border-strong bg-surface pb-1 font-mono text-label font-bold uppercase tracking-eyebrow text-text-secondary"
      style={{
        left: `${SLAB_MIN_X}%`,
        right: `${100 - SLAB_MAX_X}%`,
        bottom: landingBottom(episode) - LANDING_H / 2,
        height: LANDING_H,
      }}
    >
      Episode {episode}
    </li>
  );
}

/**
 * Everything drawn behind the floors, in one SVG: the ladders and the rail's
 * floor ticks. x is % of the map's width and y is px (the viewBox is 100 wide
 * and as tall as the map), with strokes kept at their screen width.
 */
function Structure({ top, frontier, height }: { top: number; frontier: number; height: number }) {
  const lit = Math.min(frontier, top);
  const paths = useMemo(
    () => ({
      litLadders: ladders(1, lit, height, false),
      brokenLadders: ladders(lit, top, height, true),
      litTicks: railTicks(1, lit, height),
      dimTicks: railTicks(lit + 1, top, height),
    }),
    [lit, top, height],
  );
  const line = { fill: "none", stroke: "currentColor", strokeLinecap: "round", vectorEffect: "non-scaling-stroke" } as const;
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
    >
      {paths.dimTicks && <path d={paths.dimTicks} className="text-white/25" strokeWidth={1.5} {...line} />}
      {paths.litTicks && <path d={paths.litTicks} className="text-signal" strokeWidth={1.5} {...line} />}
      {/* The ladders' shadow on the terrain behind, offset like the slabs' drop-shadow. */}
      <g transform={`translate(${LADDER_SHADOW_X} ${LADDER_SHADOW_Y})`} className="text-black/45">
        {paths.brokenLadders && <path d={paths.brokenLadders} strokeWidth={2.5} {...line} />}
        {paths.litLadders && <path d={paths.litLadders} strokeWidth={3} {...line} />}
      </g>
      {paths.brokenLadders && <path data-ladders="broken" d={paths.brokenLadders} className="text-white/20" strokeWidth={2} {...line} />}
      {paths.litLadders && <path data-ladders="lit" d={paths.litLadders} className="text-signal/75" strokeWidth={2.5} {...line} />}
    </svg>
  );
}

/** A tick on the rail at each floor's top surface, floors `from`..`to`. */
function railTicks(from: number, to: number, height: number): string {
  const parts: string[] = [];
  for (let n = from; n <= to; n++) parts.push(`M${RAIL_X} ${height - slabTop(n)}H${RAIL_X + RAIL_TICK_W}`);
  return parts.join("");
}

/** The ladders from floor `from` up to floor `to`, as one path. */
function ladders(from: number, to: number, height: number, broken: boolean): string {
  const parts: string[] = [];
  for (let n = from; n < to; n++) {
    for (const [y0, y1] of ladderSpans(n)) parts.push(ladder(ladderX(n), y0, y1, height, broken));
  }
  return parts.join("");
}

/** One ladder stretch from `y0` up to `y1` (px from the map's bottom): two rails and its rungs. */
function ladder(x: number, y0: number, y1: number, height: number, broken: boolean): string {
  const left = (x - LADDER_W / 2).toFixed(2);
  const right = (x + LADDER_W / 2).toFixed(2);
  const length = y1 - y0;
  /** A rail from `a` to `b`, as fractions of the stretch. */
  const rail = (at: string, a: number, b: number) => `M${at} ${height - (y0 + a * length)}V${height - (y0 + b * length)}`;
  const rails = broken
    ? rail(left, 0, BROKEN_GAP_FROM) + rail(left, BROKEN_GAP_TO, 1) + rail(right, 0, BROKEN_RIGHT_TO)
    : rail(left, 0, 1) + rail(right, 0, 1);

  const rungs: string[] = [];
  const count = Math.floor(length / RUNG_PITCH);
  for (let i = 0; i < count; i++) {
    const y = y0 + RUNG_PITCH / 2 + i * RUNG_PITCH;
    // A broken ladder has lost every other rung, and all of them past its short rail.
    const missing = broken && (i % 2 === 1 || y > y0 + BROKEN_RIGHT_TO * length);
    if (!missing) rungs.push(`M${left} ${height - y}H${right}`);
  }
  return rails + rungs.join("");
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function SkullIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-void" aria-hidden>
      <path d="M12 2C7 2 3.5 5.6 3.5 10.2c0 2.6 1.2 4.6 3 5.9V19a1 1 0 0 0 1 1h1.5v-2h2v2h2v-2h2v2h1.5a1 1 0 0 0 1-1v-2.9c1.8-1.3 3-3.3 3-5.9C20.5 5.6 17 2 12 2Zm-3.5 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm7 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
    </svg>
  );
}
