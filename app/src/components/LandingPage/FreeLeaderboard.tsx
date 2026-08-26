/**
 * FreeLeaderboard — the free skill-climb top climbers, on the landing page.
 *
 * The highest peak-height records across ALL stacks (earned by playing the free
 * endless climb — no payment). Server component; the query is cached with the
 * landing's ISR. Rank #1 gets the signal glow; each row links to that stack's
 * climb leaderboard. Handles are pseudonyms — emails are never shown.
 */

import Link from "next/link";
import { topClimbersGlobal } from "../../db/climb";
import { resolveGameCategory } from "../../game/categories";

export async function FreeLeaderboard() {
  const climbers = await topClimbersGlobal(8).catch(() => []);

  return (
    <section
      aria-label="Free climb leaderboard"
      className="py-20 px-4 border-t border-border-subtle bg-surface/30"
    >
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end justify-between gap-4 mb-8">
          <div>
            <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted">
              <span className="rounded-full border border-border-strong px-2 py-0.5 text-[10px] text-text-secondary">
                Free
              </span>
              the warm-up game
            </span>
            <h2 className="font-display text-2xl md:text-3xl text-text-secondary mt-3">
              Top climbers
            </h2>
            <p className="text-sm text-text-muted mt-2">
              No stakes, no payout — climb the endless game for practice and
              bragging rights. Best peak height is your rank.
            </p>
          </div>
          <Link
            href="/#towers"
            className="hidden sm:inline-flex font-mono text-xs uppercase tracking-[0.14em] text-text-muted hover:text-text-primary whitespace-nowrap transition"
          >
            Play free →
          </Link>
        </div>

        {climbers.length === 0 ? (
          <div className="relative overflow-hidden rounded-2xl border border-border-strong bg-surface p-10 text-center">
            <div className="pointer-events-none absolute inset-0 survey-grid opacity-50" />
            <p className="relative font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted">
              [ no climbers yet ]
            </p>
            <p className="relative text-text-secondary text-sm mt-3">
              Be the first to set a height record.{" "}
              <Link href="/#towers" className="text-text-primary underline underline-offset-4 hover:text-signal">
                Pick a stack and climb →
              </Link>
            </p>
          </div>
        ) : (
          <ol className="flex flex-col gap-1.5" aria-label="Top climbers across all stacks">
            {climbers.map((c) => {
              const cat = resolveGameCategory(c.categorySlug);
              const first = c.rank === 1;
              return (
                <li key={`${c.userId}-${c.categorySlug}`}>
                  <Link
                    href={`/climb/${c.categorySlug}`}
                    className={
                      "group relative overflow-hidden flex items-center gap-3 rounded-xl border px-3 py-2.5 min-h-[48px] transition-colors " +
                      (first
                        ? "border-border-strong bg-surface"
                        : "border-border-subtle bg-surface/40 hover:border-border-strong")
                    }
                  >
                    <span
                      className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center font-mono text-xs font-bold tabular-nums border border-border-strong text-text-secondary"
                    >
                      {c.rank}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-text-primary truncate">
                        {c.handle}
                      </span>
                      <span className="block font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted truncate">
                        {cat.label}
                      </span>
                    </span>
                    {c.wins > 0 && (
                      <span className="font-mono text-xs text-text-muted tabular-nums">
                        {c.wins}★
                      </span>
                    )}
                    <span className="font-mono tabular-nums font-bold text-text-secondary">
                      {c.peakY.toFixed(0)}
                      <span className="text-text-muted font-normal">m</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
