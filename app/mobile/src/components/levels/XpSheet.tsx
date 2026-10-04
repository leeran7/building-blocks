import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { DAILY_XP_MAX, STAR_XP } from "@app/levels/rules";
import { tapLight } from "../../lib/haptics";
import { avatarSrc } from "../../lib/avatarImages";
import { useSwipeToDismiss } from "../../hooks/useSwipeToDismiss";
import { progressionOf } from "../../lib/levels/progression";
import type { SeasonView } from "../../lib/levels/model";
import { StarIcon, XpBar } from "./LevelBits";
import { TowerIcon } from "./LevelIcons";
import { SHEET_MOTION_CSS } from "./LevelStartSheet";

/**
 * The XP pill's sheet: the player level, how to earn the next one, and what
 * the season opens up next (new power-ups and obstacles, star characters and
 * the star chest). A guest earns no characters, so theirs stay out.
 */
export function XpSheet({ season, guest, onClose }: { season: SeasonView; guest: boolean; onClose: () => void }) {
  const p = progressionOf(season);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const scrimRef = useRef<HTMLButtonElement>(null);
  useSwipeToDismiss(sheetRef, onClose, scrimRef);

  useEffect(() => {
    // Hand focus back to the pill that opened the sheet.
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

  const characters = guest ? [] : p.characters;
  const comingUp = p.tower.length > 0 || characters.length > 0 || p.starsToChest !== null;

  // Portalled to the body: screens sit in a stacking context under the tab bar.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="presentation">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        ref={scrimRef}
        onClick={onClose}
        className="ls-scrim absolute inset-0 bg-void/70 backdrop-blur-sm"
      />
      <section
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="xp-sheet-title"
        data-xp-sheet
        className="ls-sheet relative w-full max-w-md max-h-[calc(100%-env(safe-area-inset-top)-0.75rem)] overflow-y-auto overscroll-contain rounded-t-[28px] border-t border-border-strong bg-surface/95 px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2 backdrop-blur-xl"
      >
        <div data-sheet-grabber aria-hidden className="-mx-5 -mt-2 flex h-5 items-center justify-center">
          <span className="block h-1 w-9 rounded-full bg-border-strong" />
        </div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="xp-sheet-title" className="font-display text-title font-black uppercase tracking-tight text-text-primary">
            Level {season.player.playerLevel}
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

        <div className="mb-4 flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-elevated/70 px-4 py-3.5">
          <XpBar player={season.player} />
          <p className="text-body text-text-primary">
            <span className="font-bold tabular-nums">{p.xpToNext.toLocaleString()} XP</span>
            <span className="text-text-secondary"> to level {season.player.playerLevel + 1}</span>
          </p>
        </div>

        <Section title="Earn XP">
          {p.nextClear && (
            <Row
              title={`Clear level ${p.nextClear.level}`}
              detail={p.nextClear.hard ? "Hard level: double XP" : "First clear of a level"}
              value={`+${p.nextClear.firstClearXp} XP`}
            />
          )}
          <Row title="Each new star" detail="Up to 3 on every level" value={`+${STAR_XP} XP`} />
          {p.episode && (
            <Row
              title={`Finish Episode ${p.episode.episode}`}
              detail={`Levels ${p.episode.first}–${p.episode.last} · ${p.episode.levelsLeft} left`}
              value={`+${p.episode.xp} XP`}
            />
          )}
          {!guest && <Row title="Daily Climb" detail={`1 XP a floor of your best run, up to ${DAILY_XP_MAX} a day`} value={`+${DAILY_XP_MAX} XP`} />}
        </Section>

        {comingUp && (
          <Section title="Coming up">
            {p.tower.map((u) => (
              <Row
                key={`${u.kind}-${u.level}`}
                icon={
                  u.color ? (
                    <span aria-hidden className="h-3 w-3 rounded-full" style={{ backgroundColor: u.color }} />
                  ) : (
                    <TowerIcon size={18} className="text-text-secondary" />
                  )
                }
                title={u.title}
                detail={u.detail}
                value={`L${u.level}`}
                valueLabel={`Level ${u.level}`}
              />
            ))}
            {characters.map((c) => {
              const src = avatarSrc(c.id);
              return (
                <Row
                  key={c.id}
                  icon={
                    src ? (
                      // eslint-disable-next-line @next/next/no-img-element -- the Vite SPA, not Next
                      <img src={src} alt="" draggable={false} className="h-8 w-8 rounded-lg object-cover opacity-60 grayscale" />
                    ) : undefined
                  }
                  title={c.name}
                  detail={`Unlocks at ${c.stars} stars · you have ${p.stars}`}
                  value={<StarsLeft n={c.starsLeft} />}
                  valueLabel={`${c.starsLeft} more stars`}
                />
              );
            })}
            {p.starsToChest !== null && (
              <Row
                icon={<StarIcon filled size={18} />}
                title="Star chest"
                detail="Boosters to start a level with"
                value={<StarsLeft n={p.starsToChest} />}
                valueLabel={`${p.starsToChest} more stars`}
              />
            )}
          </Section>
        )}
      </section>
      <style>{SHEET_MOTION_CSS}</style>
    </div>,
    document.body,
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4" aria-label={title}>
      <h3 className="mb-1.5 font-mono text-label uppercase tracking-label text-text-secondary">{title}</h3>
      <ul className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-elevated/70">{children}</ul>
    </section>
  );
}

function Row({
  icon,
  title,
  detail,
  value,
  valueLabel,
}: {
  icon?: ReactNode;
  title: string;
  detail: string;
  value: ReactNode;
  /** The value as words, when its text reads badly aloud ("L16", "12 ★"). */
  valueLabel?: string;
}) {
  return (
    <li className="flex min-h-[52px] items-center gap-3 px-3.5 py-2">
      {icon && <span className="flex w-8 shrink-0 items-center justify-center">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-meta font-bold text-text-primary">{title}</span>
        <span className="block text-meta text-text-secondary">{detail}</span>
      </span>
      <span className="shrink-0 font-display text-meta font-black tabular-nums text-signal">
        {valueLabel ? (
          <>
            <span aria-hidden>{value}</span>
            <span className="sr-only">{valueLabel}</span>
          </>
        ) : (
          value
        )}
      </span>
    </li>
  );
}

function StarsLeft({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      {n}
      <StarIcon filled size={13} />
    </span>
  );
}
