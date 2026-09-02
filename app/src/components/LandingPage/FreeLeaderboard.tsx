/**
 * FreeLeaderboard — the standalone free stack top climbers on the landing page.
 *
 * ONE global leaderboard (not per paid category). Placed after the paid stack
 * directory so paid remains the primary conversion path. Server component;
 * cached with the landing's ISR.
 */

import Link from "next/link";
import { topFreeClimbers } from "../../db/climb";
import { ALTITUDE_UNIT } from "../../lib/units";

export async function FreeLeaderboard() {
  const climbers = await topFreeClimbers(8).catch(() => []);

  return (
    <section
      id="free"
      aria-label="Free climb leaderboard"
      className="scroll-mt-20 py-20 px-4 border-t border-border-subtle bg-surface/30"
    >
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end justify-between gap-4 mb-8">
          <div>
            <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted">
              <span className="rounded-full border border-border-strong px-2 py-0.5 text-[10px] text-text-secondary">
                Free
              </span>
              warm-up game · separate stack
            </span>
            <h2 className="font-display text-2xl md:text-3xl text-text-secondary mt-3">
              Top climbers
            </h2>
            <p className="text-sm text-text-muted mt-2 max-w-lg">
              No stakes, no payout — one endless climb for practice and bragging
              rights. Best peak height is your rank.{" "}
              <Link href="/play" className="text-text-secondary underline underline-offset-4 hover:text-signal">
                Play free →
              </Link>
            </p>
          </div>
          <Link
            href="/climb"
            className="hidden sm:inline-flex font-mono text-xs uppercase tracking-[0.14em] text-text-muted hover:text-text-primary whitespace-nowrap transition"
          >
            Full leaderboard →
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
              <Link href="/play" className="text-text-primary underline underline-offset-4 hover:text-signal">
                Play the free climb →
              </Link>
            </p>
          </div>
        ) : (
          <ol className="flex flex-col gap-1.5" aria-label="Free climb leaderboard">
            {climbers.map((c) => {
              const first = c.rank === 1;
              return (
                <li key={c.userId}>
                  <div
                    className={
                      "relative overflow-hidden flex items-center gap-3 rounded-xl border px-3 py-2.5 min-h-[48px] " +
                      (first
                        ? "border-border-strong bg-surface"
                        : "border-border-subtle bg-surface/40")
                    }
                  >
                    <span className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center font-mono text-xs font-bold tabular-nums border border-border-strong text-text-secondary">
                      {c.rank}
                    </span>
                    <span className="flex-1 min-w-0 text-sm font-medium text-text-primary truncate">
                      {c.handle}
                    </span>
                    {c.wins > 0 && (
                      <span className="font-mono text-xs text-text-muted tabular-nums">
                        {c.wins}★
                      </span>
                    )}
                    <span className="font-mono tabular-nums font-bold text-text-secondary">
                      {c.peakY.toFixed(0)}
                      <span className="text-text-muted font-normal">{ALTITUDE_UNIT}</span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
