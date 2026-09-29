import { POWER_UP_SPECS } from "@app/game/powerups";
import { BOOSTER_TYPES, type BoosterInventory, type BoosterType } from "@app/levels/engagement";
import { tapLight } from "../../lib/haptics";
import type { ChestProgress } from "../../lib/levels/model";
import { StarIcon } from "./LevelBits";

/**
 * Star chests and boosters (design §6.4): every 20 lifetime stars opens a
 * chest of power-ups, and an owned one can be spent to start a level with it.
 * The server rolls the chests and spends the boosters; these only show what
 * it said. The result card's chest opening is in ChestOpening.tsx.
 */

/** Total boosters owned. */
export function boosterCount(inventory: BoosterInventory): number {
  let n = 0;
  for (const t of BOOSTER_TYPES) n += inventory[t] ?? 0;
  return n;
}

/** The map's chest meter: stars toward the next chest, and boosters owned. */
export function ChestMeter({ chests, boosters }: { chests: ChestProgress; boosters: BoosterInventory }) {
  const { starsIntoChest, perChest } = chests;
  const left = perChest - starsIntoChest;
  const owned = boosterCount(boosters);
  const pct = Math.round((starsIntoChest / perChest) * 100);
  return (
    <div
      role="group"
      aria-label={`Star chest: ${starsIntoChest} of ${perChest} stars, ${left} to go.${owned > 0 ? ` ${owned} ${owned === 1 ? "booster" : "boosters"} owned.` : ""}`}
      className="glass flex items-center gap-2 rounded-full border border-white/10 py-1 pl-1.5 pr-3"
    >
      <ChestIcon size={22} />
      <div className="flex min-w-0 flex-col">
        <span aria-hidden className="flex items-center gap-1 font-mono text-label font-bold tabular-nums text-text-primary">
          <StarIcon filled size={11} />
          {starsIntoChest}/{perChest}
        </span>
        <span aria-hidden className="mt-0.5 block h-1 w-16 overflow-hidden rounded-full bg-white/10">
          <span
            className="block h-full origin-left rounded-full bg-signal transition-transform duration-500 ease-out motion-reduce:transition-none"
            style={{ transform: `scaleX(${pct / 100})` }}
          />
        </span>
      </div>
      {owned > 0 && (
        <span aria-hidden className="ml-1 rounded-md bg-signal/15 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-label text-signal">
          {owned} boost
        </span>
      )}
    </div>
  );
}

/**
 * The start card's booster picker: owned boosters this level allows, one
 * tap to equip and another to take it off. A run that already starts with a
 * free power-up (streak or stuck help) cannot use one, so the picker says
 * the boosters are kept instead.
 */
export function BoosterPicker({
  inventory,
  allowed,
  selected,
  onSelect,
  freeStart,
}: {
  inventory: BoosterInventory;
  /** Power-ups unlocked on this level. */
  allowed: readonly string[];
  selected: BoosterType | null;
  onSelect: (type: BoosterType | null) => void;
  /** The run already starts with a free power-up. */
  freeStart: boolean;
}) {
  const owned = BOOSTER_TYPES.filter((t) => (inventory[t] ?? 0) > 0);
  if (owned.length === 0) return null;
  const usable = owned.filter((t) => allowed.includes(t));
  const heading = (
    <p id="booster-picker-label" className="font-mono text-label font-bold uppercase tracking-label text-text-secondary">
      Boosters
    </p>
  );
  if (freeStart || usable.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-elevated/70 px-3.5 py-2.5">
        {heading}
        <p className="mt-1 text-meta text-text-secondary">
          {freeStart
            ? "This run already starts with a free power-up, so your boosters are kept."
            : "Your boosters unlock on later levels."}
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-white/10 bg-elevated/70 px-3.5 py-2.5">
      {heading}
      <div role="group" aria-labelledby="booster-picker-label" className="mt-2 flex flex-wrap gap-2">
        {usable.map((type) => {
          const spec = POWER_UP_SPECS[type];
          const on = selected === type;
          return (
            <button
              key={type}
              type="button"
              aria-pressed={on}
              aria-label={`${spec.label}, ${inventory[type]} owned`}
              onClick={() => {
                void tapLight();
                onSelect(on ? null : type);
              }}
              className={`flex min-h-[44px] items-center gap-1.5 rounded-xl border-2 px-3 text-meta font-bold transition-transform active:scale-95 ${on ? "bg-white/10" : "border-white/10 bg-surface/60"}`}
              style={on ? { borderColor: spec.color } : undefined}
            >
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: spec.color }} />
              <span style={{ color: on ? spec.color : undefined }}>{spec.label}</span>
              <span aria-hidden className="font-mono text-label tabular-nums text-text-secondary">×{inventory[type]}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-meta text-text-secondary">
        {selected
          ? `You start with ${POWER_UP_SPECS[selected].label} at GO. It's used up unless you restart within 3 seconds.`
          : "Tap one to start with it at GO."}
      </p>
    </div>
  );
}

export function ChestIcon({ size = 20, open = false }: { size?: number; open?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      {open ? (
        <path d="M4 8.5 6 4h12l2 4.5" stroke="#cbf24d" strokeWidth="1.8" strokeLinejoin="round" fill="rgba(203,242,77,0.18)" />
      ) : (
        <path d="M4 10V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v2" stroke="#cbf24d" strokeWidth="1.8" fill="rgba(203,242,77,0.18)" />
      )}
      <rect x="3.5" y="10" width="17" height="9.5" rx="1.8" stroke="#cbf24d" strokeWidth="1.8" fill="rgba(203,242,77,0.12)" />
      <rect x="10.5" y="9" width="3" height="4" rx="0.8" fill="#cbf24d" />
    </svg>
  );
}
