import { AnimatePresence } from "motion/react";
import { useState } from "react";
import { formatGems } from "@app/lib/avatars";
import { useShop } from "../../contexts/ShopContext";
import { tapLight } from "../../lib/haptics";
import { GemIcon } from "./GemIcon";
import { GemPacksSheet } from "./GemPacksSheet";

/**
 * The gem balance pill with a "+" that opens the gem packs, as in the store
 * design's top right. Shows a dash until the balance loads. `compact` is the
 * map header's gem cell (MapHeader): no pill of its own, the panel is its frame.
 */
export function GemBalance({ compact = false }: { compact?: boolean }) {
  const { shop } = useShop();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div
        data-gem-balance
        className={`flex items-center ${
          compact ? "h-14 gap-1 pl-2.5 pr-0.5" : "glass h-11 gap-1.5 rounded-2xl border border-white/10 pl-3 pr-0"
        }`}
      >
        <GemIcon size={compact ? 16 : 18} />
        <span
          aria-label={shop ? `${formatGems(shop.gems)} gems` : "Loading gems"}
          className={`font-display font-black tabular-nums text-text-primary ${
            compact ? "min-w-[1.5rem] pr-1 text-meta" : "min-w-[2.5rem] text-lead"
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
          // A 44px tap target around the 36px disc, so the pill stays 44px tall.
          className="group flex h-11 w-11 shrink-0 items-center justify-center rounded-xl focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal"
        >
          <span
            className={`cta-lime flex items-center justify-center text-void transition-transform group-active:scale-90 ${
              compact ? "h-9 w-9 rounded-full" : "h-9 w-9 rounded-xl"
            }`}
          >
            <svg aria-hidden width={compact ? 16 : 18} height={compact ? 16 : 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
        </button>
      </div>
      <AnimatePresence>
        {open && <GemPacksSheet onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </>
  );
}
