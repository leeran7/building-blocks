/**
 * /duel/leaderboard — 1v1 duel standings (free + paid when flag on).
 *
 * Server component. Reads from the DB directly (same pattern as /climb).
 * force-dynamic so a new match shows up immediately after result is saved.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "../../../src/components/Navbar";
import { FreeDuelLeaderboard, PaidDuelLeaderboard } from "../../../src/components/Duel/DuelLeaderboard";
import { topDuelStats, topPaidDuelStats } from "../../../src/db/duel";
import { PAID_DUELS_ENABLED } from "../../../src/config/paidDuel";
import { buildMetadata } from "../../../src/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "1v1 Leaderboard — Doomstack",
  description: "Top 1v1 duel players ranked by wins. Free and paid match records.",
  path: "/duel/leaderboard",
});

export default async function DuelLeaderboardPage() {
  const [freeEntries, paidEntries] = await Promise.all([
    topDuelStats(50).catch((err) => {
      console.error("[/duel/leaderboard] free standings read failed:", err);
      return null;
    }),
    PAID_DUELS_ENABLED
      ? topPaidDuelStats(25).catch((err) => {
          console.error("[/duel/leaderboard] paid standings read failed:", err);
          return null;
        })
      : Promise.resolve([] as Awaited<ReturnType<typeof topPaidDuelStats>>),
  ]);

  return (
    <div className="grain topo min-h-screen bg-void text-text-primary">
      <Navbar contextLabel="1v1" />

      {/* Tab band */}
      <div className="border-b border-border-subtle">
        <div className="max-w-2xl mx-auto w-full px-4 py-2">
          <div
            className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface p-1"
            role="tablist"
            aria-label="1v1 sections"
          >
            <DuelTab href="/duel" label="Play" active={false} />
            <DuelTab href="/duel/leaderboard" label="Leaderboard" active={true} />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto w-full px-4 py-8 flex flex-col gap-10">
        {/* Free 1v1 */}
        <section>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted mb-1">
            [ all matches ]
          </p>
          <h2 className="font-display text-2xl font-bold text-text-primary mb-5">
            Free 1v1
          </h2>
          <FreeDuelLeaderboard
            entries={freeEntries ?? []}
            unavailable={freeEntries === null}
          />
        </section>

        {/* Paid 1v1 — only rendered when flag is on */}
        {PAID_DUELS_ENABLED && (
          <section>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal mb-1">
              [ real stakes ]
            </p>
            <h2 className="font-display text-2xl font-bold text-text-primary mb-5">
              Paid 1v1
            </h2>
            <PaidDuelLeaderboard
              entries={paidEntries ?? []}
              unavailable={paidEntries === null}
            />
          </section>
        )}
      </div>
    </div>
  );
}

function DuelTab({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      aria-current={active ? "page" : undefined}
      className={
        "inline-flex items-center justify-center px-4 min-h-[44px] rounded-full text-sm font-semibold whitespace-nowrap transition-[color,filter] focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void " +
        (active
          ? "bg-signal text-void hover:brightness-110"
          : "text-text-secondary hover:text-text-primary")
      }
    >
      {label}
    </Link>
  );
}
