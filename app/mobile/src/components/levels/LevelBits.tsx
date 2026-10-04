import { useEffect, useId, useState, type ReactNode } from "react";
import { formatClock, MAX_STARS, type PlayerStats } from "../../lib/levels/model";

/**
 * Small pieces shared by the level map, the start card and the result card:
 * star rows, the lives pill with its refill countdown, the XP bar, and the
 * start card's fold-out sections.
 */

/** Wall clock that re-reads every `intervalMs` while mounted. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Calls `onDue` once when `at` passes (e.g. to refetch when a life arrives). */
export function useWhenDue(at: number | null, onDue: () => void): void {
  useEffect(() => {
    if (at === null) return;
    const id = setTimeout(onDue, Math.max(0, at - Date.now()) + 250);
    return () => clearTimeout(id);
  }, [at, onDue]);
}

export function StarIcon({ filled, size = 16, className = "" }: { filled: boolean; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      className={`${filled ? "text-signal" : "text-white/20"} ${className}`}
      fill="currentColor"
    >
      <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
    </svg>
  );
}

/** A row of three stars, `count` of them filled. */
export function StarRow({ count, size = 14, className = "" }: { count: number; size?: number; className?: string }) {
  return (
    <span role="img" aria-label={`${count} of ${MAX_STARS} stars`} className={`inline-flex items-center gap-0.5 ${className}`}>
      {Array.from({ length: MAX_STARS }, (_, i) => (
        <StarIcon key={i} filled={i < count} size={size} />
      ))}
    </span>
  );
}

export function HeartIcon({ size = 18, className = "text-ember" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3 4.5 6.7 4.5c2.1 0 3.6 1.1 4.3 2.4.7-1.3 2.2-2.4 4.3-2.4 3.7 0 5.8 3.8 4.3 7.2C19.5 16.4 12 21 12 21z" />
    </svg>
  );
}

/** "Full", or the time until the next life ("12:04"). */
export function livesLabel(player: PlayerStats, now: number): string {
  if (player.lives >= player.maxLives || player.nextLifeAt === null) return "Full";
  return formatClock(player.nextLifeAt - now);
}

/**
 * Lives count plus the refill countdown: the first cell of the map header
 * (MapHeader), filling it. With `onPress` it is a button (it opens the lives
 * sheet, where a refill is sold).
 */
export function LivesPill({ player, onPress }: { player: PlayerStats; onPress?: () => void }) {
  const now = useNow();
  const label = livesLabel(player, now);
  const full = label === "Full";
  const className = "flex h-14 w-full items-center justify-center gap-1.5 px-1 min-[360px]:gap-2 min-[360px]:px-2";
  // The countdown ticks every second, so it is not a live region: only the
  // lives count is announced, and only when it changes.
  const body = (
    <>
      <span role="status" className="sr-only">
        {player.lives} of {player.maxLives} lives
      </span>
      <span aria-hidden className="relative inline-flex">
        <HeartIcon size={22} />
        <span className="absolute inset-0 flex items-center justify-center font-display text-[11px] font-black text-void">
          {player.lives}
        </span>
      </span>
      <span className={`font-mono text-label font-bold tabular-nums uppercase tracking-[0.04em] min-[360px]:tracking-label ${full ? "text-text-secondary" : "text-text-primary"}`}>
        <span className="sr-only">{full ? "Lives full" : "Next life in "}</span>
        <span aria-hidden={full || undefined}>{label}</span>
      </span>
    </>
  );
  if (!onPress) return <span className={className}>{body}</span>;
  return (
    <button
      type="button"
      data-lives-pill
      // The ticking countdown stays out of the name, which only changes with the count.
      aria-label={`Lives, ${player.lives} of ${player.maxLives}`}
      aria-haspopup="dialog"
      onClick={onPress}
      className={`${className} transition-colors active:bg-white/5`}
    >
      {body}
    </button>
  );
}

/** Player level badge and progress to the next player level (result card, XP sheet). */
export function XpBar({ player }: { player: PlayerStats }) {
  return (
    <span className="glass inline-flex h-11 items-center gap-2 rounded-full border border-white/10 pl-1.5 pr-3.5">
      <span
        aria-hidden
        className="flex h-8 min-w-8 items-center justify-center rounded-full bg-signal px-1.5 font-display text-meta font-black tabular-nums text-void"
      >
        {player.playerLevel}
      </span>
      <span className="flex flex-col gap-1">
        <span className="font-mono text-[10px] font-bold uppercase tracking-label text-text-secondary">
          {player.xpIntoLevel.toLocaleString()} / {player.xpForNext.toLocaleString()} XP
        </span>
        <XpProgress player={player} className="w-20" />
      </span>
    </span>
  );
}

/** The bar toward the next player level, as a progressbar. Width from `className`. */
export function XpProgress({ player, className }: { player: PlayerStats; className: string }) {
  const pct = player.xpForNext > 0 ? Math.min(100, (player.xpIntoLevel / player.xpForNext) * 100) : 0;
  return (
    <span
      role="progressbar"
      aria-label={`Player level ${player.playerLevel}`}
      aria-valuemin={0}
      aria-valuemax={player.xpForNext}
      aria-valuenow={player.xpIntoLevel}
      className={`block h-1.5 overflow-hidden rounded-full bg-white/10 ${className}`}
    >
      <span className="block h-full rounded-full bg-signal" style={{ width: `${pct}%` }} />
    </span>
  );
}

/**
 * A progress ring around `children` (the map header's player level and star
 * chest). Decorative: the caller names the progress.
 */
export function ProgressRing({ pct, size = 44, children }: { pct: number; size?: number; children: ReactNode }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const shown = Math.max(0, Math.min(100, pct));
  return (
    <span className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3.5" />
        {shown > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={`${(c * shown) / 100} ${c}`}
            className="text-signal"
          />
        )}
      </svg>
      <span className="relative">{children}</span>
    </span>
  );
}

/**
 * A start-card section that folds: its label and a one-line summary stay
 * visible, the detail opens on tap. Closed by default so Play stays in reach.
 * The detail stays in the DOM (hidden) so screen readers and search find it.
 */
export function Accordion({
  label,
  summary,
  icon,
  className = "mt-2",
  children,
}: {
  label: string;
  summary: ReactNode;
  /** A small icon before the label, in the card's accent. */
  icon?: ReactNode;
  /** Spacing above the card; a parent with its own gap passes "". */
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className={`rounded-2xl border border-white/10 bg-elevated/70 ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[48px] w-full items-center gap-2.5 px-3.5 py-2 text-left"
      >
        {icon && <span className="shrink-0 text-text-secondary">{icon}</span>}
        <span className="shrink-0 font-mono text-label uppercase tracking-[0.06em] text-text-secondary">{label}</span>
        <span className="min-w-0 flex-1 truncate text-right text-meta text-text-primary">{summary}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className={`shrink-0 text-text-secondary transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div id={panelId} hidden={!open} className="px-3.5 pb-2.5">
        {children}
      </div>
    </div>
  );
}
