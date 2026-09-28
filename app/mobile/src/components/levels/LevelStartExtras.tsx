import { useEffect, useState, type ReactNode } from "react";
import { POWER_UP_SPECS } from "@app/game/powerups";
import { STREAK_RAPID_CLIMB, STUCK_BOOSTER_FAILS, type StartPowerUp } from "@app/levels/engagement";
import { formatClock, type LevelBoardView, type StuckHelp } from "../../lib/levels/model";
import { Accordion, StarRow } from "./LevelBits";

/**
 * What the start card adds beyond the level itself (§5c, §6.3): the win
 * streak, stuck help, and the power-up the run will start with. Rendered by
 * the map into LevelStartSheet's `extras` slot, so the sheet stays about the
 * level.
 */

/** Why the run starts with its power-up, in the player's words. */
export function startPowerUpReason(p: StartPowerUp, streak: number): string {
  if (p.source === "streak") return `Win streak ${streak}`;
  if (p.source === "stuck_help") return `Free help after ${STUCK_BOOSTER_FAILS} tries`;
  return "Booster";
}

/** A power-up's name in its own colour, with a dot. */
export function PowerUpName({ type }: { type: StartPowerUp["type"] }) {
  const spec = POWER_UP_SPECS[type];
  return (
    <span className="inline-flex items-center gap-1.5 font-bold" style={{ color: spec.color }}>
      <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: spec.color }} />
      {spec.label}
    </span>
  );
}

/** Rows shown before the board is cut off (the caller is always kept). */
const BOARD_ROWS = 5;

type BoardState = { kind: "loading" } | { kind: "ready"; board: LevelBoardView } | { kind: "error" };

/**
 * The level's friends-only board (§4): accepted friends' best times and the
 * player's own. Loaded when the card opens; a failed load hides the section
 * rather than blocking Play.
 */
export function FriendsBoard({ level, load }: { level: number; load: (level: number) => Promise<LevelBoardView> }) {
  const [state, setState] = useState<BoardState>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    setState({ kind: "loading" });
    load(level).then(
      (board) => live && setState({ kind: "ready", board }),
      () => live && setState({ kind: "error" }),
    );
    return () => {
      live = false;
    };
  }, [level, load]);

  if (state.kind === "error") return null;
  const heading = (
    <span className="font-mono text-label font-bold uppercase tracking-label text-text-secondary">Friends</span>
  );
  // Loading and empty fit on one line beside the heading.
  const oneLine = (text: string, busy = false) => (
    <p
      className="mt-2 flex flex-wrap items-baseline gap-x-2 rounded-2xl border border-white/10 bg-elevated/70 px-3.5 py-2 text-meta text-text-secondary"
      aria-busy={busy || undefined}
    >
      {heading}
      <span>{text}</span>
    </p>
  );
  if (state.kind === "loading") return oneLine("Loading…", true);
  const { board } = state;
  const top = board.entries.slice(0, BOARD_ROWS);
  const me = board.entries.find((e) => e.isMe);
  const rows = me && !top.includes(me) ? [...top, me] : top;
  if (rows.length === 0) {
    return oneLine(board.friendCount === 0 ? "Add friends to race their times here." : "No friend has cleared it yet.");
  }
  const summary = me ? `You're #${me.rank} of ${board.entries.length}` : `${board.entries.length} cleared`;
  return (
    <Accordion label="Friends" summary={summary}>
      <ol aria-label={`Friends' best times on level ${board.level}`} className="flex flex-col gap-0.5">
        {rows.map((e) => (
          <li
            key={`${e.rank}-${e.handle}`}
            className={`flex items-center gap-2 text-meta tabular-nums ${e.isMe ? "font-bold text-signal" : "text-text-primary"}`}
          >
            <span className="w-5 text-text-secondary">{e.rank}</span>
            <span className="min-w-0 flex-1 truncate">{e.isMe ? "You" : e.handle}</span>
            <StarRow count={e.stars} size={11} />
            <span>{formatClock(e.timeMs)}</span>
          </li>
        ))}
      </ol>
    </Accordion>
  );
}

export function LevelStartExtras({
  atFrontier,
  streak,
  startPowerUp,
  stuck = null,
  board = null,
  boosters = null,
}: {
  /** The card is for the player's frontier level: streaks count here only. */
  atFrontier: boolean;
  streak: number;
  /** The server's preview of what this run starts with. */
  startPowerUp: StartPowerUp | null;
  /** Stuck help for this level (the frontier's only). */
  stuck?: StuckHelp | null;
  /** The level's friends board: its level and loader. */
  board?: { level: number; load: (level: number) => Promise<LevelBoardView> } | null;
  /** The booster picker (LevelChests' BoosterPicker), §6.4. */
  boosters?: ReactNode;
}) {
  const showStreak = atFrontier && streak > 0;
  const ghost = atFrontier && stuck !== null && stuck.routeGhostAvailable;
  const boardEl = board ? <FriendsBoard level={board.level} load={board.load} /> : null;
  if (!showStreak && !startPowerUp && !ghost && !boosters) return boardEl;
  return (
    <div className="mt-2 flex flex-col gap-2">
      {boosters}
      {startPowerUp && (
        <p className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-2xl border border-white/10 bg-elevated/70 px-3.5 py-2 text-meta text-text-primary">
          <span>
            You start with <PowerUpName type={startPowerUp.type} />
          </span>
          <span className="text-text-secondary">{startPowerUpReason(startPowerUp, streak)}</span>
        </p>
      )}
      {showStreak && !startPowerUp && (
        <p className="text-meta text-text-secondary">
          Win streak {streak}.{" "}
          {streak < STREAK_RAPID_CLIMB
            ? `${STREAK_RAPID_CLIMB - streak} more first ${STREAK_RAPID_CLIMB - streak === 1 ? "clear" : "clears"} for a free power-up.`
            : "Keep it going."}
        </p>
      )}
      {ghost && (
        <p className="text-meta text-text-secondary">
          Route ghost unlocked. It arrives in a coming update.
        </p>
      )}
      {boardEl}
    </div>
  );
}
