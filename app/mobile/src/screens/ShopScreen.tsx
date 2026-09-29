import { useNavigate } from "react-router-dom";
import { CHARACTER_ENTRIES, formatGems, gemPrice, skinsOf, type AvatarEntry } from "@app/lib/avatars";
import { useAuth } from "../contexts/AuthContext";
import { useShop } from "../contexts/ShopContext";
import { HexAvatar } from "../components/HexAvatar";
import { RetryPanel, ScreenHeader } from "../components/ui";
import { GemBalance } from "../components/store/GemBalance";
import { GemIcon } from "../components/store/GemIcon";
import { LAVA_CLEARANCE } from "../components/AnimatedBackdrop";
import { tapLight } from "../lib/haptics";

/** Characters sold in the Shop: every one with a paid skin (the stick figures have none). */
export const SHOP_CHARACTERS: readonly AvatarEntry[] = CHARACTER_ENTRIES.filter((c) => skinsOf(c.id).length > 0);

/**
 * The Shop tab: the gem balance and every character's paid Wraith-style
 * skin. A card opens Skin Details, where skins are bought and equipped.
 */
export function ShopScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { shop, error, loading, refresh } = useShop();
  const owned = new Set(shop?.ownedIds ?? []);

  return (
    <main data-shop-page className="flex h-full min-h-0 flex-col">
      <ScreenHeader title="Shop" eyebrow="Skins and characters" trailing={<GemBalance />} />
      <div
        className="min-h-0 flex-1 overflow-y-auto px-4"
        style={{ WebkitOverflowScrolling: "touch", paddingBottom: LAVA_CLEARANCE }}
      >
        {error && !shop ? (
          <RetryPanel message={error} retrying={loading} attempts={0} onRetry={() => void refresh()} />
        ) : (
          <ul aria-label="Characters" className="grid grid-cols-2 gap-2.5">
            {SHOP_CHARACTERS.map((c) => {
              const skin = skinsOf(c.id)[0];
              const price = gemPrice(skin);
              const has = owned.has(skin.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    data-shop-character={c.id}
                    onClick={() => {
                      void tapLight();
                      navigate(`/shop/${c.id}`);
                    }}
                    className="flex w-full flex-col items-center gap-2 rounded-2xl border border-white/10 bg-[rgba(16,15,20,0.9)] px-2 pb-3 pt-3 transition-transform active:scale-95"
                  >
                    <HexAvatar userId={user?.uid ?? c.id} name={skin.name} avatarId={skin.id} size={64} />
                    <span className="text-center font-display text-meta font-black uppercase leading-tight text-text-primary">
                      {skin.name}
                    </span>
                    <span className="flex items-center gap-1 font-mono text-label font-bold uppercase tracking-label text-text-secondary">
                      {has ? (
                        <span className="text-signal">Owned</span>
                      ) : (
                        <>
                          <GemIcon size={12} />
                          {price === null ? "" : formatGems(price)}
                        </>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
