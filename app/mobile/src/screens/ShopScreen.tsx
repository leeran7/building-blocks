import { useNavigate } from "react-router-dom";
import { CHARACTER_ENTRIES, formatGems, gemPrice, skinsOf, type AvatarEntry } from "@app/lib/avatars";
import { useShop } from "../contexts/ShopContext";
import { CharacterPreview } from "../components/CharacterPreview";
import { RetryPanel, ScreenHeader } from "../components/ui";
import { GemBalance } from "../components/store/GemBalance";
import { GemIcon } from "../components/store/GemIcon";
import { ShopLivesTile } from "../components/store/ShopLivesTile";
import { LAVA_CLEARANCE } from "../components/AnimatedBackdrop";
import { tapLight } from "../lib/haptics";

/** Characters sold in the Shop: every one with a paid skin (the stick figures have none). */
export const SHOP_CHARACTERS: readonly AvatarEntry[] = CHARACTER_ENTRIES.filter((c) => skinsOf(c.id).length > 0);

/** The character the Shop features: the one sold outright, whose skins are recolours. */
export const FEATURED_CHARACTER_ID = "wraith";

/** The Void glow behind every figure: the Void Walker's violet. */
const VOID_RGB = "155, 92, 255";

/**
 * The Shop tab: the gem balance, the lives refill, the Wraith as the featured
 * character, then every other character in its paid Void skin. Figures are
 * the climbers as they look in a run, not portraits. A card opens Skin
 * Details, where looks are bought and equipped.
 */
export function ShopScreen() {
  const navigate = useNavigate();
  const { shop, error, loading, refresh } = useShop();
  const owned = new Set(shop?.ownedIds ?? []);
  const featured = SHOP_CHARACTERS.find((c) => c.id === FEATURED_CHARACTER_ID);
  const grid = SHOP_CHARACTERS.filter((c) => c.id !== FEATURED_CHARACTER_ID);
  const ownedSkins = grid.filter((c) => owned.has(skinsOf(c.id)[0].id)).length;

  const open = (characterId: string, look: string) => {
    void tapLight();
    navigate(`/shop/${characterId}`, { state: { look } });
  };

  return (
    <main data-shop-page className="flex h-full min-h-0 flex-col">
      <ScreenHeader title="Shop" eyebrow="Gear up" trailing={<GemBalance />} />
      <div
        className="min-h-0 flex-1 overflow-y-auto px-4"
        style={{ WebkitOverflowScrolling: "touch", paddingBottom: LAVA_CLEARANCE }}
      >
        <ShopLivesTile />
        {error && !shop ? (
          <RetryPanel message={error} retrying={loading} attempts={0} onRetry={() => void refresh()} />
        ) : (
          <>
            {featured && (
              <FeaturedCard character={featured} owned={owned.has(featured.id)} onOpen={() => open(featured.id, featured.id)} />
            )}
            <div className="mb-2.5 mt-5 flex items-baseline justify-between px-1">
              <h2 className="font-display text-lead font-black uppercase text-text-primary">Void skins</h2>
              {shop && (
                <span data-shop-owned-count className="font-mono text-label uppercase tracking-label text-text-secondary">
                  {ownedSkins} of {grid.length} owned
                </span>
              )}
            </div>
            <ul aria-label="Characters" className="grid grid-cols-2 gap-2.5">
              {grid.map((c) => {
                const skin = skinsOf(c.id)[0];
                return (
                  <li key={c.id}>
                    <SkinCard
                      character={c}
                      skin={skin}
                      owned={owned.has(skin.id)}
                      onOpen={() => open(c.id, skin.id)}
                    />
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}

/** A look's price, or Owned. */
function PriceTag({ entry, owned }: { entry: AvatarEntry; owned: boolean }) {
  if (owned) {
    return (
      <span className="inline-flex items-center gap-1 self-start rounded-full bg-signal/15 px-2 py-0.5 font-mono text-label font-bold uppercase tracking-label text-signal">
        <Check />
        Owned
      </span>
    );
  }
  const price = gemPrice(entry);
  if (price === null) return null;
  return (
    <span className="inline-flex items-center gap-1 self-start font-mono text-label font-bold tabular-nums tracking-label text-text-primary">
      <GemIcon size={13} />
      {formatGems(price)}
    </span>
  );
}

/** The Wraith, walking, with its colour skins as swatches. */
function FeaturedCard({ character, owned, onOpen }: { character: AvatarEntry; owned: boolean; onOpen: () => void }) {
  const colours = skinsOf(character.id).filter((s) => s.skinColor !== undefined);
  const price = gemPrice(character);
  return (
    <button
      type="button"
      data-shop-featured={character.id}
      aria-label={`${character.name}, featured character, ${owned ? "owned" : price === null ? "" : `${formatGems(price)} gems`}`}
      onClick={onOpen}
      className="relative flex w-full items-stretch overflow-hidden rounded-3xl border text-left transition-transform active:scale-[0.98]"
      style={{
        borderColor: `rgba(${VOID_RGB}, 0.45)`,
        background: `radial-gradient(110% 95% at 20% 88%, rgba(${VOID_RGB}, 0.42), transparent 62%), linear-gradient(160deg, #1b1428 0%, #0f0e13 72%)`,
        boxShadow: `0 18px 40px -22px rgba(${VOID_RGB}, 0.8), inset 0 1px 0 rgba(255,255,255,0.06)`,
      }}
    >
      <span className="relative flex w-[44%] shrink-0 items-end justify-center">
        <FloorShadow width={96} />
        <CharacterPreview avatarId={character.id} pose="walk" locked={false} figurePx={124} sizePx={150} ambient />
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 py-4 pr-4">
        <span className="font-mono text-label font-bold uppercase tracking-label" style={{ color: "#c7a8ff" }}>
          Featured character
        </span>
        <span className="font-display text-title font-black uppercase text-text-primary">{character.name}</span>
        <span className="text-meta text-text-secondary">The only climber sold outright.</span>
        {colours.length > 0 && (
          <span className="flex items-center gap-1.5 font-mono text-label uppercase tracking-label text-text-secondary">
            {colours.map((s) => (
              <span
                key={s.id}
                aria-hidden
                data-featured-swatch={s.id}
                className="h-2.5 w-2.5 rounded-full ring-1 ring-white/25"
                style={{ background: s.skinColor }}
              />
            ))}
            <span className="ml-0.5">{colours.length} colours</span>
          </span>
        )}
        <span className="mt-1">
          <PriceTag entry={character} owned={owned} />
        </span>
      </span>
    </button>
  );
}

/** One character, standing beside itself in its Void skin. */
function SkinCard({
  character,
  skin,
  owned,
  onOpen,
}: {
  character: AvatarEntry;
  skin: AvatarEntry;
  owned: boolean;
  onOpen: () => void;
}) {
  const price = gemPrice(skin);
  return (
    <button
      type="button"
      data-shop-character={character.id}
      aria-label={`${skin.name}, ${owned ? "owned" : price === null ? "" : `${formatGems(price)} gems`}`}
      onClick={onOpen}
      className={`flex w-full flex-col overflow-hidden rounded-2xl border bg-[rgba(16,15,20,0.92)] text-left transition-transform active:scale-[0.97] ${
        owned ? "border-signal/45" : "border-white/10"
      }`}
    >
      <span
        className="relative block h-[128px] w-full overflow-hidden"
        style={{ background: `radial-gradient(65% 75% at 50% 82%, rgba(${VOID_RGB}, 0.3), transparent 72%)` }}
      >
        {/* The character beside its Void skin: what the card sells. Placed by percent so both fit a 320px phone. */}
        <span aria-hidden data-skin-figure className="absolute bottom-0 flex left-[74%] -translate-x-1/2 opacity-90">
          <CharacterPreview avatarId={skin.id} pose="idle" locked={false} figurePx={74} sizePx={88} still />
        </span>
        <span aria-hidden data-character-figure className="absolute bottom-0 flex left-[38%] -translate-x-1/2">
          <FloorShadow width={56} />
          <CharacterPreview avatarId={character.id} pose="idle" locked={false} figurePx={100} sizePx={116} still />
        </span>
      </span>
      <span className="flex flex-col gap-1 border-t border-white/5 px-3 pb-3 pt-2">
        <span className="truncate font-display text-body font-black uppercase leading-tight text-text-primary">
          {character.name}
        </span>
        <PriceTag entry={skin} owned={owned} />
      </span>
    </button>
  );
}

/** The soft shadow a figure stands on. */
function FloorShadow({ width }: { width: number }) {
  return (
    <span
      aria-hidden
      className="absolute bottom-[5px] left-1/2 h-3 -translate-x-1/2 rounded-[50%] bg-black/70 blur-[3px]"
      style={{ width }}
    />
  );
}

function Check() {
  return (
    <svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5 10 17.5 19 7" />
    </svg>
  );
}
