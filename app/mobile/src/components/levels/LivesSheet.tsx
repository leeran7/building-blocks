import { useEffect, useMemo, useRef } from "react";
import { tapLight } from "../../lib/haptics";
import { useSwipeToDismiss } from "../../hooks/useSwipeToDismiss";
import { SheetPortal } from "../SheetPortal";
import type { PlayerStats } from "../../lib/levels/model";
import { HeartIcon, livesLabel, useNow } from "./LevelBits";
import { RefillLives, type RefillOffer } from "./LevelStartSheet";

/**
 * The lives pill's sheet: how many lives, when the next one comes, and the
 * paid refill whenever lives are not full, so a player can top up before a
 * hard level instead of only once they are out. A bought refill closes the
 * sheet so its payoff plays on the map.
 */
export function LivesSheet({
  player,
  offer,
  onClose,
}: {
  player: PlayerStats;
  offer: RefillOffer;
  onClose: () => void;
}) {
  const now = useNow();
  const full = player.lives >= player.maxLives;
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const scrimRef = useRef<HTMLButtonElement>(null);
  useSwipeToDismiss(sheetRef, onClose, scrimRef);

  useEffect(() => {
    // Hand focus back to the pill that opened the sheet.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // A sheet opened on top (the gem packs) handles its own Escape.
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

  const refill = useMemo<RefillOffer>(
    () => ({
      ...offer,
      buy: async () => {
        const res = await offer.buy();
        if (res.ok) onClose();
        return res;
      },
    }),
    [offer, onClose],
  );

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
        aria-labelledby="lives-sheet-title"
        data-lives-sheet
        className="relative w-full max-w-md max-h-[calc(100%-env(safe-area-inset-top)-0.75rem)] overflow-y-auto overscroll-contain rounded-t-[28px] border-t border-border-strong bg-surface/95 px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2 backdrop-blur-xl"
      >
        {/* The grabber: drag the sheet down from here (or its top) to close it. */}
        <div data-sheet-grabber aria-hidden className="-mx-5 -mt-2 flex h-5 items-center justify-center">
          <span className="block h-1 w-9 rounded-full bg-border-strong" />
        </div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="lives-sheet-title" className="font-display text-title font-black uppercase tracking-tight text-text-primary">
            Lives
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

        <div className="mb-3 flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-elevated/70 px-4 py-3.5">
          <span aria-hidden className="flex gap-1.5">
            {Array.from({ length: player.maxLives }, (_, i) => (
              <HeartIcon key={i} size={26} className={i < player.lives ? "text-ember" : "text-ember opacity-25"} />
            ))}
          </span>
          <p className="text-body text-text-primary">
            <span className="font-bold">
              {player.lives} of {player.maxLives} lives
            </span>
            {full ? (
              <span className="text-text-secondary"> · Full</span>
            ) : (
              <>
                {" "}
                <span className="text-text-secondary">· Next life in</span>{" "}
                <span className="font-display font-black tabular-nums">{livesLabel(player, now)}</span>
              </>
            )}
          </p>
        </div>

        {full ? (
          <p className="pb-2 text-center text-meta text-text-secondary">
            You&rsquo;re full. Come back here for a refill when you lose one.
          </p>
        ) : (
          <RefillLives offer={refill} />
        )}
      </section>
    </SheetPortal>
  );
}
