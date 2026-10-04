import type { ReactNode } from "react";
import type { BoosterInventory } from "@app/levels/engagement";
import type { ChestProgress, PlayerStats } from "../../lib/levels/model";
import { GemBalance } from "../store/GemBalance";
import { LivesPill, ProgressRing } from "./LevelBits";
import { ChestMeter } from "./LevelChests";

/**
 * The level map's header: one glass panel in one row of cells: the player
 * level in an XP ring (it opens the XP sheet), lives, the star chest's ring
 * (it opens the chest sheet) and gems. The season and episode sit under the
 * panel. A guest has no chest or gems: their panel is the level, lives and a
 * Sign In cell (`trailing`). Every tap target is 44px+.
 */
export function MapHeader({
  seasonName,
  episode,
  player,
  chests,
  boosters,
  showGems,
  onLives,
  onXp,
  onChest,
  trailing,
}: {
  seasonName: string;
  episode: number;
  player: PlayerStats;
  /** The star chest; null leaves its cell out (a guest, or a client without chests). */
  chests: ChestProgress | null;
  boosters: BoosterInventory;
  /** Whether the gem cell shows (it needs the Shop). */
  showGems: boolean;
  /** Opens the lives sheet; without it the lives cell is not a button. */
  onLives?: () => void;
  onXp: () => void;
  /** Opens the chest sheet; without it the chest cell is not a button. */
  onChest?: () => void;
  /** A last cell after the others (the guest's Sign In). */
  trailing?: ReactNode;
}) {
  const divider = "border-l border-white/[0.06]";
  return (
    <>
      <div className="glass flex overflow-hidden rounded-[22px] border border-white/10">
        <span data-tour="xp" className="flex shrink-0">
          <PlayerLevelButton player={player} onPress={onXp} />
        </span>
        <span data-tour="lives" className={`flex min-w-0 flex-1 ${divider}`}>
          <LivesPill player={player} onPress={onLives} />
        </span>
        {chests && (
          <span data-tour="chest" className={`flex min-w-0 flex-1 ${divider}`}>
            <ChestMeter chests={chests} boosters={boosters} onPress={onChest} />
          </span>
        )}
        {showGems && (
          <span data-tour="gems" className={`flex shrink-0 ${divider}`}>
            <GemBalance compact />
          </span>
        )}
        {trailing && <span className={`flex shrink-0 items-center px-2 ${divider}`}>{trailing}</span>}
      </div>
      <p className="mt-2 text-center font-mono text-label font-bold uppercase tracking-label text-text-secondary">
        {seasonName} · Episode {episode}
      </p>
    </>
  );
}

/** The player level in a ring of XP toward the next one; opens the XP sheet. */
function PlayerLevelButton({ player, onPress }: { player: PlayerStats; onPress: () => void }) {
  const pct = player.xpForNext > 0 ? (player.xpIntoLevel / player.xpForNext) * 100 : 0;
  return (
    <button
      type="button"
      data-xp-pill
      aria-label={`Player level ${player.playerLevel}, ${player.xpIntoLevel.toLocaleString()} of ${player.xpForNext.toLocaleString()} XP. Show what unlocks next`}
      aria-haspopup="dialog"
      onClick={onPress}
      className="flex h-14 items-center px-2 transition-colors active:bg-white/5"
    >
      <span
        role="progressbar"
        aria-label={`Player level ${player.playerLevel}`}
        aria-valuemin={0}
        aria-valuemax={player.xpForNext}
        aria-valuenow={player.xpIntoLevel}
      >
        <ProgressRing pct={pct}>
          <span className="font-display text-meta font-black tabular-nums text-signal">{player.playerLevel}</span>
        </ProgressRing>
      </span>
    </button>
  );
}
