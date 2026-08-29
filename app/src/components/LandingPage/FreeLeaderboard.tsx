/**
 * FreeLeaderboard — the standalone free stack top climbers on the landing page.
 *
 * ONE global leaderboard (not per paid category). Server component; cached with
 * the landing's ISR. Rank #1 gets the signal glow; rows link to /climb.
 */

import Link from "next/link";
import { topFreeClimbers } from "../../db/climb";

export async function FreeLeaderboard() {
  const climbers = await topFreeClimbers(10).catch(() => []);

  return (
    <section
      id="free"
      aria-label="Free climb leaderboard"
      className="scroll-mt-20 relative overflow-hidden py-20 md:py-24 px-4 border-t border-border-subtle"
    >
      {/* atmosphere */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(90% 80% at 20% 0%, rgb(203 242 77 / 0.14), transparent 55%), radial-gradient(70% 50% at 90% 100%, rgb(255 90 44 / 0.08), transparent 60%)",
        }}
      />

      <div className="relative max-w-4xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
              <span className="rounded-full bg-signal text-void px-2.5 py-0.5 text-[10px] font-bold shadow-signal">
                Free
              </span>
              its own stack · no category
            </span>
            <h2 className="font-display text-4xl md:text-6xl text-text-primary mt-4">
              Free climb leaderboard
            </h2>
            <p className="text-base text-text-secondary mt-3 max-w-xl">
              One endless game, one leaderboard. No stakes, no payout — climb as
              high as you can for practice and bragging rights. Best peak height
              is your rank.
            </p>
          </div>
          <Link
            href="/play"
            className="flex-shrink-0 inline-flex items-center justify-center gap-2 rounded-full bg-signal text-void font-semibold px-7 py-3.5 text-base shadow-signal hover:brightness-110 active:scale-[0.98] transition-[filter,transform] min-h-[52px]"
          >
            Play free →
          </Link>
        </div>

        {climbers.length === 0 ? (
          <div className="relative overflow-hidden rounded-2xl border border-signal/30 bg-surface p-12 text-center shadow-signal">
            <div className="pointer-events-none absolute inset-0 survey-grid opacity-50" />
            <p className="relative font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted">
              [ no climbers yet ]
            </p>
            <p className="relative text-text-secondary text-sm mt-3">
              Be the first on the board.{" "}
              <Link href="/play" className="text-signal underline underline-offset-4 hover:brightness-110">
                Play the free climb →
              </Link>
            </p>
          </div>
        ) : (
          <>
            <ol className="flex flex-col gap-2" aria-label="Free climb leaderboard">
              {climbers.map((c) => {
                const first = c.rank === 1;
                return (
                  <li key={c.userId}>
                    <div
                      className={
                        "relative overflow-hidden flex items-center gap-3 rounded-xl border px-4 py-3 min-h-[52px] " +
                        (first
                          ? "border-signal/50 bg-surface shadow-signal"
                          : "border-border-subtle bg-surface/60")
                      }
                    >
                      <span
                        className={
                          "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-mono text-sm font-bold tabular-nums " +
                          (first
                            ? "bg-signal text-void"
                            : "border border-border-strong text-text-secondary")
                        }
                      >
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
                      <span
                        className={
                          "font-mono tabular-nums font-bold " +
                          (first ? "text-signal" : "text-text-secondary")
                        }
                      >
                        {c.peakY.toFixed(0)}
                        <span className="text-text-muted font-normal">m</span>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="mt-6 text-center">
              <Link
                href="/climb"
                className="font-mono text-xs uppercase tracking-[0.14em] text-text-muted hover:text-signal transition-colors"
              >
                View full leaderboard →
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
