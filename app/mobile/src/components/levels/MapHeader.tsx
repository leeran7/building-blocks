import type { BoosterInventory } from "@app/levels/engagement";
import type { ChestProgress, PlayerStats } from "../../lib/levels/model";
import { GemBalance } from "../store/GemBalance";
import { LivesPill, XpProgress } from "./LevelBits";
import { ChestMeter } from "./LevelChests";

/**
 * The level map's header: one glass panel. The top line is the season and
 * episode with the player level (it opens the XP sheet); under it, cells for
 * lives, the star chest and gems. A guest has no chest or gems, so their
 * lives cell spans the panel. Every tap target is 44px or more.
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
}) {
  return (
    <div className="glass overflow-hidden rounded-[22px] border border-white/10">
      <div className="flex h-11 items-center gap-2 pl-4 pr-1">
        <p className="min-w-0 flex-1 truncate font-mono text-label font-bold uppercase tracking-[0.08em] text-text-secondary min-[360px]:tracking-label">
          {seasonName} · <span className="min-[360px]:hidden">Ep</span>
          <span className="hidden min-[360px]:inline">Episode</span> {episode}
        </p>
        <span data-tour="xp" className="inline-flex shrink-0">
          <PlayerLevelButton player={player} onPress={onXp} />
        </span>
      </div>
      <div className="flex border-t border-white/[0.06]">
        <span data-tour="lives" className="flex min-w-0 flex-1">
          <LivesPill player={player} onPress={onLives} />
        </span>
        {chests && (
          <span data-tour="chest" className="flex min-w-0 flex-1 border-l border-white/[0.06]">
            <ChestMeter chests={chests} boosters={boosters} />
          </span>
        )}
        {showGems && (
          <span data-tour="gems" className="flex shrink-0 border-l border-white/[0.06]">
            <GemBalance compact />
          </span>
        )}
      </div>
    </div>
  );
}

/** "LV 5" and the bar to the next player level; opens the XP sheet. */
function PlayerLevelButton({ player, onPress }: { player: PlayerStats; onPress: () => void }) {
  return (
    <button
      type="button"
      data-xp-pill
      aria-label={`Player level ${player.playerLevel}, ${player.xpIntoLevel.toLocaleString()} of ${player.xpForNext.toLocaleString()} XP. Show what unlocks next`}
      aria-haspopup="dialog"
      onClick={onPress}
      className="flex h-11 items-center gap-2 rounded-full px-2.5 transition-transform active:scale-95 min-[360px]:px-3"
    >
      <span aria-hidden className="font-mono text-label font-bold uppercase tracking-label text-text-secondary">
        Lv <span className="text-text-primary">{player.playerLevel}</span>
      </span>
      <XpProgress player={player} className="w-10 min-[360px]:w-14" />
    </button>
  );
}
