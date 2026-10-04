import { useState } from "react";
import { formatGems } from "@app/lib/avatars";
import { useShop } from "../../contexts/ShopContext";
import { tapLight } from "../../lib/haptics";
import { GemIcon } from "./GemIcon";
import { GemPacksSheet } from "./GemPacksSheet";

/**
 * The gem balance pill with a "+" that opens the gem packs, as in the store
 * design's top right. Shows a dash until the balance loads. `compact` is the
 * map's size, matching the lives and XP pills beside it.
 */
export function GemBalance({ compact = false }: { compact?: boolean }) {
  const { shop } = useShop();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div
        data-gem-balance
        className={`glass flex items-center border border-white/10 pr-1 ${
          compact ? "h-10 gap-1.5 rounded-full pl-2.5" : "h-11 gap-2 rounded-2xl pl-3"
        }`}
      >
        <GemIcon size={compact ? 16 : 18} />
        <span
          aria-label={shop ? `${formatGems(shop.gems)} gems` : "Loading gems"}
          className={`font-display font-black tabular-nums text-text-primary ${
            compact ? "min-w-[1.5rem] text-meta" : "min-w-[2.5rem] text-lead"
          }`}
        >
          {shop ? formatGems(shop.gems) : "—"}
        </span>
        <button
          type="button"
          aria-label="Get gems"
          onClick={() => {
            void tapLight();
            setOpen(true);
          }}
          // The visible disc is 32-36px; the ::before pad grows the tap target
          // to 44px+ without making the pill taller.
          className={`cta-lime relative flex items-center justify-center text-void transition-transform active:scale-90 before:absolute before:-inset-1.5 before:content-[''] ${
            compact ? "h-8 w-8 rounded-full" : "h-9 w-9 rounded-xl"
          }`}
        >
          <svg aria-hidden width={compact ? 16 : 18} height={compact ? 16 : 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
      {open && <GemPacksSheet onClose={() => setOpen(false)} />}
    </>
  );
}
