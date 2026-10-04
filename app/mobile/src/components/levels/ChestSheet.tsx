import { useEffect, useRef } from "react";
import { POWER_UP_SPECS } from "@app/game/powerups";
import { BOOSTER_TYPES, MAX_CHEST_BOOSTERS, type BoosterInventory } from "@app/levels/engagement";
import { tapLight } from "../../lib/haptics";
import { useSwipeToDismiss } from "../../hooks/useSwipeToDismiss";
import type { ChestProgress } from "../../lib/levels/model";
import { ProgressRing } from "./LevelBits";
import { BoosterGlyph } from "./LevelIcons";
import { boosterCount, ChestIcon } from "./LevelChests";
import { Row, Section, StarsLeft } from "./SheetRows";
import { SheetPortal } from "../SheetPortal";

/**
 * The chest cell's sheet: what the player has to use now (the boosters owned,
 * each with what it does and how many) and how far the next star chest is.
 * Chests open on the result card of the run that fills them, so there is
 * nothing to claim here; the boosters are spent from a level's start card.
 */
export function ChestSheet({
  chests,
  boosters,
  onClose,
}: {
  chests: ChestProgress;
  boosters: BoosterInventory;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const scrimRef = useRef<HTMLButtonElement>(null);
  useSwipeToDismiss(sheetRef, onClose, scrimRef);

  useEffect(() => {
    // Hand focus back to the chest cell that opened the sheet.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
    // Once per opening: onClose changes identity on every map render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { starsIntoChest, perChest } = chests;
  const left = perChest - starsIntoChest;
  const owned = BOOSTER_TYPES.filter((t) => (boosters[t] ?? 0) > 0);
  const total = boosterCount(boosters);

  // Portalled to the body: screens sit in a stacking context under the tab bar.
  return (
    <SheetPortal
      scrim={
        <button
          type="button"
          aria-label="Close"
          tabIndex={-1}
          ref={scrimRef}
          onClick={onClose}
          className="absolute inset-0 bg-void/70 backdrop-blur-sm"
        />
      }
    >
      <section
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chest-sheet-title"
        data-chest-sheet
        className="relative w-full max-w-md max-h-[calc(100%-env(safe-area-inset-top)-0.75rem)] overflow-y-auto overscroll-contain rounded-t-[28px] border-t border-border-strong bg-surface/95 px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2 backdrop-blur-xl"
      >
        <div data-sheet-grabber aria-hidden className="-mx-5 -mt-2 flex h-5 items-center justify-center">
          <span className="block h-1 w-9 rounded-full bg-border-strong" />
        </div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="chest-sheet-title" className="font-display text-title font-black uppercase tracking-tight text-text-primary">
            Star chest
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={() => {
              void tapLight();
              onClose();
            }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-raised text-text-secondary transition-transform active:scale-90"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="mb-4 flex items-center gap-3.5 rounded-2xl border border-white/10 bg-elevated/70 px-4 py-3.5">
          <span
            role="progressbar"
            aria-label="Stars toward the next chest"
            aria-valuemin={0}
            aria-valuemax={perChest}
            aria-valuenow={starsIntoChest}
          >
            <ProgressRing pct={(starsIntoChest / perChest) * 100} size={56}>
              <ChestIcon size={26} />
            </ProgressRing>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-body text-text-primary">
              <span className="font-bold tabular-nums">
                {starsIntoChest}/{perChest}
              </span>
              <span className="text-text-secondary"> stars · {left} to the next chest</span>
            </span>
            <span className="block text-meta text-text-secondary">
              Every chest holds 1–{MAX_CHEST_BOOSTERS} boosters and opens when a run earns its last star.
            </span>
          </span>
        </div>

        <Section title={total > 0 ? `Your boosters · ${total}` : "Your boosters"}>
          {owned.length > 0 ? (
            owned.map((type) => {
              const spec = POWER_UP_SPECS[type];
              const n = boosters[type] ?? 0;
              return (
                <Row
                  key={type}
                  icon={<BoosterGlyph type={type} size={24} />}
                  title={spec.label}
                  detail={spec.description}
                  value={`×${n}`}
                  valueLabel={`${n} owned`}
                />
              );
            })
          ) : (
            <Row
              icon={<ChestIcon size={22} />}
              title="None yet"
              detail="Your first chest fills them up"
              value={<StarsLeft n={left} />}
              valueLabel={`${left} more stars`}
            />
          )}
        </Section>
        <p className="text-meta text-text-secondary">
          {owned.length > 0
            ? "Pick one on a level's start card to begin the run with it."
            : "Earn stars on any level. A fast finish gives up to 3."}
        </p>
      </section>
    </SheetPortal>
  );
}
