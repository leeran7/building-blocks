import { useState } from "react";
import { formatGems } from "@app/lib/avatars";
import { useShop } from "../../contexts/ShopContext";
import { tapLight } from "../../lib/haptics";
import { GemIcon } from "./GemIcon";
import { GemPacksSheet } from "./GemPacksSheet";

/**
 * The gem balance pill with a "+" that opens the gem packs, as in the store
 * design's top right. Shows a dash until the balance loads.
 */
export function GemBalance() {
  const { shop } = useShop();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div
        data-gem-balance
        className="glass flex h-11 items-center gap-2 rounded-2xl border border-white/10 pl-3 pr-1"
      >
        <GemIcon />
        <span
          aria-label={shop ? `${formatGems(shop.gems)} gems` : "Loading gems"}
          className="min-w-[2.5rem] font-display text-lead font-black tabular-nums text-text-primary"
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
          className="cta-lime flex h-9 w-9 items-center justify-center rounded-xl text-void transition-transform active:scale-90"
        >
          <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
      {open && <GemPacksSheet onClose={() => setOpen(false)} />}
    </>
  );
}
