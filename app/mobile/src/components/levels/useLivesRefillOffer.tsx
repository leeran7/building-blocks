import { useState, type ReactNode } from "react";
import { useLevels } from "../../contexts/LevelsContext";
import { useOptionalShop } from "../../contexts/ShopContext";
import { GemPacksSheet } from "../store/GemPacksSheet";
import type { BuyLivesResult } from "../../lib/levels/model";
import type { RefillOffer } from "./LevelStartSheet";

/**
 * The paid lives refill as the out-of-lives cards offer it, or null when none
 * can be sold. The balance shown is the Shop's when it has loaded one (it
 * follows gem packs bought from here), else the level profile's; a refill
 * pushes its new balance back to the Shop so the gem pill agrees. Render
 * `gemPacks` next to the card: it is the gem-pack sheet "Get gems" opens.
 */
export function useLivesRefillOffer(): { offer: RefillOffer | null; gemPacks: ReactNode } {
  const { season, buyLives } = useLevels();
  const shop = useOptionalShop();
  const [packsOpen, setPacksOpen] = useState(false);
  if (!buyLives || !season?.refill) return { offer: null, gemPacks: null };

  const buy = async (): Promise<BuyLivesResult> => {
    const res = await buyLives();
    if (res.ok) shop?.apply({ gems: res.gems });
    else if (res.code === "NOT_ENOUGH_GEMS" && res.gems !== undefined) shop?.apply({ gems: res.gems });
    return res;
  };
  return {
    offer: {
      gems: shop?.shop?.gems ?? season.refill.gems,
      cost: season.refill.cost,
      buy,
      ...(shop ? { onGetGems: () => setPacksOpen(true) } : {}),
    },
    gemPacks: packsOpen ? <GemPacksSheet onClose={() => setPacksOpen(false)} /> : null,
  };
}
