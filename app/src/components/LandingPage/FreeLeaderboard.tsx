/**
 * FreeLeaderboard — the standalone free stack top climbers on the landing page.
 *
 * TWO boards (mobile default, desktop). Placed after the paid stack directory so
 * paid remains the primary conversion path. Server component; cached with the
 * landing's ISR.
 */

import Link from "next/link";
import { topFreeClimbers } from "../../db/climb";
import { FreeLeaderboardBoard } from "./FreeLeaderboardBoard";

export async function FreeLeaderboard() {
  const [mobile, desktop] = await Promise.all([
    topFreeClimbers(8, "mobile").catch(() => []),
    topFreeClimbers(8, "desktop").catch(() => []),
  ]);

  return (
    <section
      id="free"
      aria-label="Free climb leaderboard"
      className="scroll-mt-20 py-20 px-4 border-t border-border-subtle bg-surface/30"
    >
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end justify-between gap-4 mb-6">
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
              rights. Touch and keyboard are ranked separately; mobile is the
              default.{" "}
              <Link href="/play" className="text-text-secondary underline underline-offset-4 hover:text-signal">
                Play free →
              </Link>
            </p>
          </div>
        </div>

        <FreeLeaderboardBoard mobile={mobile} desktop={desktop} />
      </div>
    </section>
  );
}
