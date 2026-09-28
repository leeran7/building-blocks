import { POWER_UP_SPECS } from "@app/game/powerups";
import { STREAK_RAPID_CLIMB, type StartPowerUp } from "@app/levels/engagement";

/**
 * What the start card adds beyond the level itself (§5c, §6.3): the win
 * streak and the power-up the run will start with. Rendered by the map into
 * LevelStartSheet's `extras` slot, so the sheet stays about the level.
 */

/** Why the run starts with its power-up, in the player's words. */
export function startPowerUpReason(p: StartPowerUp, streak: number): string {
  if (p.source === "streak") return `Win streak ${streak}`;
  if (p.source === "stuck_help") return "Free help after 3 tries";
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

export function LevelStartExtras({
  atFrontier,
  streak,
  startPowerUp,
}: {
  /** The card is for the player's frontier level: streaks count here only. */
  atFrontier: boolean;
  streak: number;
  /** The server's preview of what this run starts with. */
  startPowerUp: StartPowerUp | null;
}) {
  const showStreak = atFrontier && streak > 0;
  if (!showStreak && !startPowerUp) return null;
  return (
    <div className="mt-3 flex flex-col gap-2">
      {startPowerUp && (
        <div className="rounded-2xl border border-white/10 bg-elevated/70 px-3.5 py-2.5">
          <p className="font-mono text-label font-bold uppercase tracking-label text-text-secondary">
            {startPowerUpReason(startPowerUp, streak)}
          </p>
          <p className="mt-1 text-meta text-text-primary">
            You start with <PowerUpName type={startPowerUp.type} /> at GO.
          </p>
        </div>
      )}
      {showStreak && !startPowerUp && (
        <p className="text-meta text-text-secondary">
          Win streak {streak}.{" "}
          {streak < STREAK_RAPID_CLIMB
            ? `${STREAK_RAPID_CLIMB - streak} more first ${STREAK_RAPID_CLIMB - streak === 1 ? "clear" : "clears"} for a free power-up.`
            : "Keep it going."}
        </p>
      )}
    </div>
  );
}
