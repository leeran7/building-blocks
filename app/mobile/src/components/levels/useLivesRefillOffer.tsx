import { useState, type ReactNode } from "react";
import { useLevels } from "../../contexts/LevelsContext";
import { useOptionalShop } from "../../contexts/ShopContext";
import { GemPacksSheet } from "../store/GemPacksSheet";
import { HeartRow, RewardReveal } from "../RewardReveal";
import type { BuyLivesResult } from "../../lib/levels/model";
import type { RefillOffer } from "./LevelStartSheet";

/**
 * The paid lives refill as the out-of-lives cards offer it, or null when none
 * can be sold. The balance shown is the Shop's when it has loaded one (it
 * follows gem packs bought from here), else the level profile's; a refill
 * pushes its new balance back to the Shop so the gem pill agrees. Render
 * `overlays` next to the card: the gem-pack sheet "Get gems" opens, and the
 * refill's payoff (here, since the card itself redraws once lives are back).
 */
export function useLivesRefillOffer(): { offer: RefillOffer | null; overlays: ReactNode } {
  const { season, buyLives } = useLevels();
  const shop = useOptionalShop();
  const [packsOpen, setPacksOpen] = useState(false);
  const [refilled, setRefilled] = useState<{ lives: number; spent: number } | null>(null);
  const reveal = refilled && (
    <RewardReveal
      subject={<HeartRow count={Math.min(refilled.lives, 5)} />}
      eyebrow="Lives refilled"
      title={`${refilled.lives} lives`}
      detail="Back on the tower."
      spent={refilled.spent}
      accent="#ff5a36"
      onDone={() => setRefilled(null)}
    />
  );
  if (!buyLives || !season?.refill) return { offer: null, overlays: reveal };
  const cost = season.refill.cost;

  const buy = async (): Promise<BuyLivesResult> => {
    const res = await buyLives();
    if (res.ok) {
      shop?.apply({ gems: res.gems });
      setRefilled({ lives: res.player.lives, spent: cost });
    } else if (res.code === "NOT_ENOUGH_GEMS" && res.gems !== undefined) shop?.apply({ gems: res.gems });
    return res;
  };
  return {
    offer: {
      gems: shop?.shop?.gems ?? season.refill.gems,
      cost: season.refill.cost,
      buy,
      ...(shop ? { onGetGems: () => setPacksOpen(true) } : {}),
    },
    overlays: (
      <>
        {packsOpen && <GemPacksSheet onClose={() => setPacksOpen(false)} />}
        {reveal}
      </>
    ),
  };
}
