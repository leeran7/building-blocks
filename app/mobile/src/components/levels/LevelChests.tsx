import type { ReactNode } from "react";
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
 * tap to equip and another to take it off. At most one booster per run. A
 * run that also starts with a free power-up (streak or stuck help) gets
 * both; a booster of the free one's own type is disabled, since granting it
 * again would only refresh the free one (the server keeps it anyway).
 */
export function BoosterPicker({
  inventory,
  allowed,
  selected,
  onSelect,
  freeType,
}: {
  inventory: BoosterInventory;
  /** Boosters a run of this level may start with (startBoosterTypes). */
  allowed: readonly string[];
  selected: BoosterType | null;
  onSelect: (type: BoosterType | null) => void;
  /** The free power-up this run already starts with, or null. */
  freeType: BoosterType | null;
}) {
  const owned = BOOSTER_TYPES.filter((t) => (inventory[t] ?? 0) > 0);
  if (owned.length === 0) return null;
  const usable = owned.filter((t) => allowed.includes(t));
  const heading = (
    <p id="booster-picker-label" className="font-mono text-label font-bold uppercase tracking-label text-text-secondary">
      Boosters
    </p>
  );
  if (usable.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-elevated/70 px-3.5 py-2.5">
        {heading}
        <p className="mt-1 text-meta text-text-secondary">Your boosters unlock on later levels.</p>
      </div>
    );
  }
  const free = freeType === null ? null : POWER_UP_SPECS[freeType].label;
  const on = selected === null ? null : POWER_UP_SPECS[selected].label;
  let hint: string;
  if (on !== null && free !== null) {
    hint = `You start with ${free} and ${on} at GO. ${on} is used up unless you restart within 3 seconds.`;
  } else if (on !== null) {
    hint = `You start with ${on} at GO. It's used up unless you restart within 3 seconds.`;
  } else if (free !== null) {
    hint = `This run already starts with ${free}. Tap a booster to add it.`;
  } else {
    hint = "Tap one to start with it at GO.";
  }
  return (
    <div className="rounded-2xl border border-white/10 bg-elevated/70 px-3.5 py-2.5">
      {heading}
      <div role="group" aria-labelledby="booster-picker-label" className="mt-2 flex flex-wrap gap-2">
        {usable.map((type) => {
          const isFree = type === freeType;
          return (
            <BoosterToggle
              key={type}
              type={type}
              pressed={selected === type}
              disabledReason={isFree ? "Free this run" : null}
              label={`${POWER_UP_SPECS[type].label}, ${inventory[type]} owned${isFree ? ", already free this run" : ""}`}
              onToggle={onSelect}
            >
              <span aria-hidden className="font-mono text-label tabular-nums text-text-secondary">×{inventory[type]}</span>
            </BoosterToggle>
          );
        })}
      </div>
      <p className="mt-2 text-meta text-text-secondary">{hint}</p>
    </div>
  );
}

/**
 * One booster as a single-select toggle: tap to equip, tap again to take it
 * off (aria-pressed, 44px tall). Disabled with a short visible reason when it
 * cannot be used. Shared by the start card and the chest reveal.
 */
export function BoosterToggle({
  type,
  pressed,
  disabledReason = null,
  label,
  prefix = null,
  onToggle,
  children = null,
}: {
  type: BoosterType;
  pressed: boolean;
  /** Why it cannot be picked here, or null when it can. */
  disabledReason?: string | null;
  /** The accessible name. */
  label: string;
  /** Before the name, e.g. "+2". */
  prefix?: string | null;
  onToggle: (type: BoosterType | null) => void;
  children?: ReactNode;
}) {
  const spec = POWER_UP_SPECS[type];
  const disabled = disabledReason !== null;
  const on = pressed && !disabled;
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        void tapLight();
        onToggle(on ? null : type);
      }}
      className={`flex min-h-[44px] items-center gap-1.5 rounded-xl border-2 px-3 text-meta font-bold transition-transform active:scale-95 disabled:opacity-50 disabled:active:scale-100 ${on ? "bg-white/10" : "border-white/10 bg-surface/60"}`}
      style={on ? { borderColor: spec.color } : undefined}
    >
      <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: spec.color }} />
      <span style={{ color: on ? spec.color : undefined }}>
        {prefix}
        {prefix ? " " : ""}
        {spec.label}
      </span>
      {children}
      {disabledReason && (
        <span aria-hidden className="font-mono text-[10px] font-bold uppercase tracking-label text-text-secondary">
          {disabledReason}
        </span>
      )}
    </button>
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
