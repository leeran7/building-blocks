import { useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import {
  avatarEntry,
  formatGems,
  gemPrice,
  lockedMessage,
  parseAvatarId,
  skinsOf,
  type AvatarEntry,
} from "@app/lib/avatars";
import { apiFetch } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useShop } from "../contexts/ShopContext";
import { echoedSetting, useInvalidateAppData, useSettings } from "../contexts/AppDataContext";
import { CharacterPreview, type PreviewPose } from "../components/CharacterPreview";
import { RewardReveal } from "../components/RewardReveal";
import { HexAvatar } from "../components/HexAvatar";
import { ScreenHeader } from "../components/ui";
import { GemBalance } from "../components/store/GemBalance";
import { GemIcon } from "../components/store/GemIcon";
import { GemPacksSheet } from "../components/store/GemPacksSheet";
import { buyWithGems, ShopError } from "../lib/shop";
import { useBackOr } from "../lib/navigation";
import { notifyError, notifySuccess, tapLight } from "../lib/haptics";

const POSES: ReadonlyArray<{ id: PreviewPose; label: string }> = [
  { id: "idle", label: "Idle" },
  { id: "walk", label: "Walk" },
  { id: "climb", label: "Climb" },
];

/** What the action button does for the selected look, and what it says. */
export type SkinAction =
  | { kind: "equipped" }
  | { kind: "equip" }
  | { kind: "buy"; price: number; balanceAfter: number }
  | { kind: "need-gems"; price: number; short: number }
  | { kind: "character-required"; character: AvatarEntry }
  | { kind: "locked"; message: string }
  | { kind: "loading" };

/**
 * The action for `entry` given what the server says the player may select
 * (settings unlockedIds), owns (Shop ownedIds) and has saved. Pure, so the
 * screen and its tests share it.
 */
export function skinAction(
  entry: AvatarEntry,
  state: { savedAvatarId: string | null; unlockedIds: readonly string[] | null; ownedIds: readonly string[] | null; gems: number | null },
): SkinAction {
  if (state.savedAvatarId === entry.id) return { kind: "equipped" };
  if (state.unlockedIds === null || state.ownedIds === null || state.gems === null) return { kind: "loading" };
  if (state.unlockedIds.includes(entry.id) || state.ownedIds.includes(entry.id)) return { kind: "equip" };
  const price = gemPrice(entry);
  if (price === null) return { kind: "locked", message: `${lockedMessage(entry)}.` };
  if (entry.skinOf !== undefined) {
    const character = avatarEntry(entry.skinOf);
    const hasCharacter =
      character !== null && (state.unlockedIds.includes(character.id) || state.ownedIds.includes(character.id));
    if (character !== null && !hasCharacter) return { kind: "character-required", character };
  }
  if (state.gems < price) return { kind: "need-gems", price, short: price - state.gems };
  return { kind: "buy", price, balanceAfter: state.gems - price };
}

/**
 * Skin Details (the store design): one character's looks, Classic and its
 * paid Void skin, with a live preview, the price and balance after purchase,
 * and Purchase / Equip. Buying equips it straight away.
 */
export function SkinDetailsScreen() {
  const { characterId } = useParams();
  const character = avatarEntry(parseAvatarId(characterId));
  if (character === null || character.skinOf !== undefined || skinsOf(character.id).length === 0) {
    return <Navigate to="/shop" replace />;
  }
  return <SkinDetails key={character.id} character={character} />;
}

function SkinDetails({ character }: { character: AvatarEntry }) {
  const goBack = useBackOr("/shop");
  const { user } = useAuth();
  const { shop, apply } = useShop();
  const { data: settings, setSettings, refreshSettings } = useSettings();
  const invalidate = useInvalidateAppData();

  const looks: AvatarEntry[] = [character, ...skinsOf(character.id)];
  const featured = looks[1];
  const [selectedId, setSelectedId] = useState<string>(() =>
    looks.some((l) => l.id === settings?.avatarId) ? (settings?.avatarId as string) : featured.id,
  );
  const selected = looks.find((l) => l.id === selectedId) ?? featured;
  const [pose, setPose] = useState<PreviewPose>("walk");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [packsOpen, setPacksOpen] = useState(false);
  // The payoff after a purchase goes through: what was bought and for how much.
  const [bought, setBought] = useState<{ entry: AvatarEntry; spent: number; equipped: boolean } | null>(null);

  const action = skinAction(selected, {
    savedAvatarId: settings?.avatarId ?? null,
    unlockedIds: settings?.avatarUnlocks?.unlockedIds ?? (settings ? [] : null),
    ownedIds: shop?.ownedIds ?? null,
    gems: shop?.gems ?? null,
  });

  const equip = async (id: string): Promise<boolean> => {
    const res = await apiFetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarId: id }),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      setError(d.error ?? "Couldn't equip it. Try again.");
      return false;
    }
    const next = echoedSetting(await res.json().catch(() => null), "avatarId", id);
    if (!next) {
      setError("Couldn't equip it. Please update the app or try again later.");
      return false;
    }
    setSettings(next);
    invalidate(["leaderboard", "friendsLeaderboard", "dashboard"]);
    return true;
  };

  const act = async () => {
    if (busy) return;
    if (action.kind === "need-gems") {
      void tapLight();
      setPacksOpen(true);
      return;
    }
    if (action.kind !== "buy" && action.kind !== "equip") return;
    void tapLight();
    setBusy(true);
    setError(null);
    try {
      if (action.kind === "buy") {
        const result = await buyWithGems(selected.id);
        apply(result);
        // The picker's unlock list now includes it.
        void refreshSettings();
        // Bought either way; the reveal plays its own success haptic.
        setBought({ entry: selected, spent: action.price, equipped: await equip(selected.id) });
        return;
      }
      if (await equip(selected.id)) void notifySuccess();
      else void notifyError();
    } catch (err) {
      // Already owned (another device bought it): equip instead of failing.
      if (err instanceof ShopError && err.code === "OWNED" && (await equip(selected.id).catch(() => false))) {
        void notifySuccess();
      } else {
        setError(err instanceof ShopError ? err.message : "Couldn't complete the purchase. Check your connection.");
        void notifyError();
      }
    } finally {
      setBusy(false);
    }
  };

  const isSkin = selected.skinOf !== undefined;
  const label = busy
    ? "…"
    : action.kind === "equipped"
      ? "Equipped"
      : action.kind === "equip"
        ? "Equip"
        : action.kind === "buy"
          ? `${isSkin ? "Buy skin" : "Buy character"} · ${formatGems(action.price)}`
          : action.kind === "need-gems"
            ? "Get gems"
            : action.kind === "character-required"
              ? `Unlock ${action.character.name} first`
              : action.kind === "loading"
                ? "Loading…"
                : "Locked";
  const enabled = !busy && (action.kind === "buy" || action.kind === "equip" || action.kind === "need-gems");
  const price = gemPrice(selected);

  return (
    <main data-skin-details className="flex h-full min-h-0 flex-col">
      <ScreenHeader title="Skin details" onBack={goBack} trailing={<GemBalance />} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <div role="group" aria-label="Preview pose" className="mx-auto flex w-fit gap-1 rounded-full border border-white/10 bg-void/70 p-[3px]">
          {POSES.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={pose === p.id}
              onClick={() => setPose(p.id)}
              className={`min-w-[84px] rounded-full px-3 py-1.5 font-mono text-label font-bold uppercase tracking-label ${
                pose === p.id ? "bg-signal text-void" : "text-text-secondary"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <section aria-label="Preview" className="flex h-[250px] items-end justify-center">
          <CharacterPreview avatarId={selected.id} pose={pose} locked={false} figurePx={200} sizePx={250} />
        </section>

        <section aria-label={`${character.name} looks`} className="px-3">
          <div role="radiogroup" aria-label="Looks" className="grid grid-cols-3 gap-3">
            {looks.map((look) => {
              const on = look.id === selected.id;
              return (
                <button
                  key={look.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-look={look.id}
                  onClick={() => {
                    if (!on) void tapLight();
                    setSelectedId(look.id);
                    setError(null);
                  }}
                  className={`flex min-h-[112px] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 px-1 py-2 backdrop-blur-sm ${
                    on ? "border-signal bg-[rgba(24,26,14,0.9)]" : "border-white/10 bg-[rgba(16,15,20,0.85)]"
                  }`}
                >
                  <HexAvatar userId={user?.uid ?? character.id} name={look.name} avatarId={look.id} size={52} />
                  <span className="text-center font-mono text-label font-bold uppercase leading-tight text-text-primary">
                    {look.skinOf === undefined ? "Classic" : look.name}
                  </span>
                </button>
              );
            })}
            <div
              aria-label="More skins coming soon"
              className="flex min-h-[112px] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-white/10 bg-[rgba(16,15,20,0.85)] px-1 py-2 text-text-secondary"
            >
              <svg aria-hidden width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              <span className="font-mono text-label font-bold">???</span>
            </div>
          </div>
        </section>

        <section aria-label="Selected look" className="mt-6 flex flex-col gap-3">
          <div className="border-b border-white/15 pb-3 text-center">
            <h2 aria-live="polite" className="font-display text-title font-black uppercase leading-none tracking-tight text-text-primary">
              {selected.name}
            </h2>
            <p className="mt-1.5 text-body text-text-secondary">
              {isSkin ? "Forged in the dark between climbs." : `The original ${character.name}.`}
            </p>
          </div>

          {isSkin && (
            <div className="glass flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3">
              <HexAvatar userId={user?.uid ?? character.id} name={character.name} avatarId={character.id} size={48} />
              <div className="min-w-0">
                <p className="text-body font-bold text-text-primary">Requires {character.name}</p>
                <p className="text-meta text-text-secondary">
                  {action.kind === "character-required" ? `${lockedMessage(action.character)}.` : "Character sold or unlocked separately."}
                </p>
              </div>
            </div>
          )}

          <div className="glass flex flex-col gap-3 rounded-2xl border border-white/10 p-3">
            {price !== null && action.kind !== "equip" && action.kind !== "equipped" && (
              <div className="flex items-center justify-center gap-4 py-1">
                <p className="flex items-center gap-2.5">
                  <GemIcon size={30} />
                  <span className="font-display text-headline font-black tabular-nums text-text-primary">{formatGems(price)}</span>
                </p>
                {(action.kind === "buy" || action.kind === "need-gems") && (
                  <p className="border-l border-white/15 pl-4 text-meta text-text-secondary">
                    {action.kind === "buy"
                      ? `Balance after purchase: ${formatGems(action.balanceAfter)}`
                      : `You need ${formatGems(action.short)} more gems`}
                  </p>
                )}
              </div>
            )}
            <button
              type="button"
              data-skin-action={action.kind}
              disabled={!enabled}
              onClick={() => void act()}
              className={`flex min-h-[56px] w-full items-center justify-center gap-3 rounded-2xl px-3 font-display text-lead font-black uppercase tracking-wide transition-transform active:scale-[0.98] ${
                enabled ? "cta-lime text-void" : "bg-elevated text-text-muted"
              }`}
            >
              {action.kind === "buy" && !busy && <GemOutline />}
              {label}
            </button>
          </div>

          {action.kind === "locked" && <p className="text-center text-meta text-text-secondary">{action.message}</p>}
          {error && (
            <p role="alert" className="text-center text-meta text-ember">
              {error}
            </p>
          )}
          <p className="text-center text-label text-text-secondary">
            {isSkin ? "Cosmetic only. No gameplay advantage." : "Skins change how you look, never how you play."}
          </p>
        </section>
      </div>
      {packsOpen && <GemPacksSheet onClose={() => setPacksOpen(false)} />}
      {bought && (
        <RewardReveal
          subject={<CharacterPreview avatarId={bought.entry.id} pose="idle" locked={false} figurePx={190} sizePx={230} />}
          eyebrow={bought.entry.skinOf !== undefined ? "New skin unlocked" : "New character unlocked"}
          title={bought.entry.name}
          detail={bought.equipped ? "Equipped. Your next climb wears it." : "It's yours. Equip it from Choose Character."}
          spent={bought.spent}
          accent={bought.entry.skinOf !== undefined ? "#b98cff" : "#cbf24d"}
          onDone={() => setBought(null)}
        />
      )}
    </main>
  );
}

/** The Buy button's gem, drawn as an outline on the lime. */
function GemOutline() {
  return (
    <svg aria-hidden width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" />
      <path d="M12 2.5 15.5 12 12 21.5 8.5 12ZM2.5 12h19" opacity="0.6" />
    </svg>
  );
}
