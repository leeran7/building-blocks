import { AnimatePresence } from "motion/react";
import { useCallback, useState } from "react";
import { formatGems } from "@app/lib/avatars";
import { useLevels } from "../../contexts/LevelsContext";
import { tapLight } from "../../lib/haptics";
import { HeartIcon, livesLabel, useNow, useWhenDue } from "../levels/LevelBits";
import { LivesSheet } from "../levels/LivesSheet";
import { useLivesRefillOffer } from "../levels/useLivesRefillOffer";

/**
 * The Shop's lives row: the lives count and the refill's price, opening the
 * same Lives sheet as the map's lives pill. Absent when no refill can be sold
 * (guests, the device-local store, an older server).
 */
export function ShopLivesTile() {
  const { season, refresh } = useLevels();
  const refill = useLivesRefillOffer();
  const [open, setOpen] = useState(false);
  const now = useNow();
  // A life that arrives while the Shop is open updates the row, as on the map.
  const refreshQuietly = useCallback(() => void refresh(), [refresh]);
  useWhenDue(season?.player.nextLifeAt ?? null, refreshQuietly);

  if (!season || !refill.offer) return <>{refill.overlays}</>;
  const { player } = season;
  const full = player.lives >= player.maxLives;
  return (
    <>
      <button
        type="button"
        data-shop-lives
        aria-haspopup="dialog"
        aria-label={`Lives, ${player.lives} of ${player.maxLives}. Refill for ${refill.offer.cost} gems`}
        onClick={() => {
          void tapLight();
          setOpen(true);
        }}
        className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-[rgba(16,15,20,0.9)] px-4 py-3 text-left transition-transform active:scale-[0.98]"
      >
        <span aria-hidden className="relative inline-flex">
          <HeartIcon size={30} />
          <span className="absolute inset-0 flex items-center justify-center font-display text-meta font-black text-void">
            {player.lives}
          </span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-display text-lead font-black uppercase text-text-primary">Lives refill</span>
          <span className="whitespace-nowrap font-mono text-label uppercase tracking-label text-text-secondary">
            {full ? "Lives full" : `${player.lives} of ${player.maxLives} · ${livesLabel(player, now)}`}
          </span>
        </span>
        <span className="font-mono text-label font-bold uppercase tracking-label text-signal">
          {formatGems(refill.offer.cost)} gems
        </span>
      </button>
      <AnimatePresence>
        {open && <LivesSheet player={player} offer={refill.offer} onClose={() => setOpen(false)} />}
      </AnimatePresence>
      {refill.overlays}
    </>
  );
}
