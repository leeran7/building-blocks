import { POWER_UP_SPECS } from "@app/game/powerups";
import { BOOSTER_TYPES, type BoosterInventory, type BoosterType } from "@app/levels/engagement";
import { tapLight } from "../../lib/haptics";
import type { ChestProgress } from "../../lib/levels/model";
import { Accordion, StarIcon } from "./LevelBits";
import { BoltIcon, BoosterGlyph, CheckBadge, NoneIcon } from "./LevelIcons";

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
 * The start card's booster picker: None, then each owned booster this level
 * allows, as tiles with the count owned. One is picked at a time. A run that
 * already starts with a free power-up (streak or stuck help) cannot use one,
 * so the picker says the boosters are kept instead.
 */
export function BoosterPicker({
  inventory,
  allowed,
  selected,
  onSelect,
  freeStart,
}: {
  inventory: BoosterInventory;
  /** Boosters a run of this level may start with (startBoosterTypes). */
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
    <p className="font-mono text-label font-bold uppercase tracking-eyebrow text-text-primary">
      Starting booster
    </p>
  );
  if (freeStart || usable.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-elevated/70 px-3.5 py-3">
        {heading}
        <p className="mt-1 text-meta text-text-secondary">
          {freeStart
            ? "This run already starts with a free power-up, so your boosters are kept."
            : "Your boosters unlock on later levels."}
        </p>
      </div>
    );
  }
  const pick = (type: BoosterType | null) => {
    if (type !== selected) void tapLight();
    onSelect(type);
  };
  // Folded by default so the sheet stays short and Play in reach; the
  // summary says what the run will start with.
  const summary = selected ? (
    <span className="inline-flex items-center gap-1.5 font-bold">
      <BoosterGlyph type={selected} size={16} />
      {POWER_UP_SPECS[selected].label}
    </span>
  ) : (
    "None"
  );
  return (
    <Accordion label="Starting booster" icon={<BoltIcon size={18} />} summary={summary} className="">
      <p className="text-meta text-text-secondary">Optional · choose one from your inventory.</p>
      <div role="radiogroup" aria-label="Starting booster" className="mt-2.5 grid grid-cols-3 gap-2">
        <BoosterTile on={selected === null} label="No booster" onPick={() => pick(null)}>
          <NoneIcon size={34} className="text-text-secondary" />
          <span className="text-meta font-bold text-text-primary">None</span>
        </BoosterTile>
        {usable.map((type) => {
          const spec = POWER_UP_SPECS[type];
          return (
            <BoosterTile
              key={type}
              on={selected === type}
              label={`${spec.label}, ${inventory[type]} owned`}
              onPick={() => pick(type)}
            >
              <BoosterGlyph type={type} size={30} />
              <span className="text-center text-meta font-bold leading-tight text-text-primary">{spec.label}</span>
              <span aria-hidden className="font-mono text-label font-bold tabular-nums text-text-secondary">
                ×{inventory[type]}
              </span>
            </BoosterTile>
          );
        })}
      </div>
      <p className="mt-2 text-meta text-text-secondary">
        {selected
          ? `Used when the run starts. Restart within 3 seconds to keep it.`
          : "Used when the run starts."}
      </p>
    </Accordion>
  );
}

function BoosterTile({
  on,
  label,
  onPick,
  children,
}: {
  on: boolean;
  label: string;
  onPick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={label}
      onClick={onPick}
      className={`relative flex min-h-[92px] flex-col items-center justify-center gap-1 rounded-xl border-2 px-1 py-2 transition-transform active:scale-95 ${
        on ? "border-signal bg-signal/[0.06]" : "border-white/10 bg-surface/60"
      }`}
    >
      {on && (
        <span className="absolute right-1.5 top-1.5">
          <CheckBadge size={18} />
        </span>
      )}
      {children}
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
