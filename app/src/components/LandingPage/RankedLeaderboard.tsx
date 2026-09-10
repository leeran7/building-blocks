import Link from "next/link";
import { chipLeaderboard } from "../../db/chips";
import { PAID_DUELS_ENABLED } from "../../config/paidDuel";

export async function RankedLeaderboard() {
  if (!PAID_DUELS_ENABLED) return null;

  const entries = await chipLeaderboard(8).catch(() => []);

  return (
    <section
      id="ranked"
      aria-label="Ranked chip duel leaderboard"
      className="scroll-reveal relative scroll-mt-20 py-20 px-4 border-t border-border-subtle"
    >
      <div className="relative z-10 max-w-3xl mx-auto">
        <div
          className="climb-reveal flex items-end justify-between gap-4 mb-8"
          style={{ animationDelay: "0ms" }}
        >
          <div>
            <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted">
              <span className="rounded-full border border-signal/40 bg-signal/10 px-2 py-0.5 text-[10px] text-signal">
                Ranked
              </span>
              chip duels · zero-sum
            </span>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-text-primary mt-2">
              Top ranked players
            </h2>
            <p className="text-sm text-text-secondary mt-2 max-w-lg">
              Stake non-cashable chips in 1v1 duels. Winner takes all — no house
              cut.{" "}
              <Link href="/duel/chips" className="text-text-secondary underline underline-offset-4 hover:text-signal">
                Play ranked →
              </Link>
            </p>
          </div>
          <Link
            href="/duel/leaderboard"
            className="hidden sm:inline-flex font-mono text-xs uppercase tracking-[0.14em] text-text-muted hover:text-text-primary whitespace-nowrap transition"
          >
            Full leaderboard →
          </Link>
        </div>

        {entries.length === 0 ? (
          <div
            className="climb-reveal relative overflow-hidden rounded-2xl border border-border-strong bg-surface p-10 text-center"
            style={{ animationDelay: "90ms" }}
          >
            <div className="pointer-events-none absolute inset-0 survey-grid opacity-50" />
            <p className="relative font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted">
              [ no chip matches yet ]
            </p>
            <p className="relative text-text-secondary text-sm mt-3">
              First chip duel to finish will claim the top spot.
            </p>
          </div>
        ) : (
          <ol
            className="climb-reveal flex flex-col gap-1.5"
            style={{ animationDelay: "90ms" }}
            aria-label="Ranked chip duel leaderboard"
          >
            {entries.map((e, i) => {
              const rank = i + 1;
              const first = rank === 1;
              const net = e.totalChipsWon;
              return (
                <li key={e.userId}>
                  <div
                    className={
                      "relative overflow-hidden flex items-center gap-3 rounded-xl border px-3 py-2.5 min-h-[48px] " +
                      (first
                        ? "border-signal/30 bg-surface"
                        : "border-border-subtle bg-surface/40")
                    }
                  >
                    <span className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center font-mono text-xs font-bold tabular-nums border border-border-strong text-text-secondary">
                      {rank}
                    </span>
                    <span className="flex-1 min-w-0 text-sm font-medium text-text-primary truncate">
                      {e.displayName ?? "Anonymous"}
                    </span>
                    <span className="font-mono text-xs text-text-muted tabular-nums">
                      {e.chipWins}W {e.chipLosses}L
                    </span>
                    <span
                      className={
                        "font-mono tabular-nums font-bold " +
                        (net > 0 ? "text-signal" : net < 0 ? "text-ember" : "text-text-secondary")
                      }
                    >
                      {net > 0 ? "+" : ""}{net.toLocaleString()}
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
