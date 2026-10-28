/**
 * /rules — how Doomstack works: levels, the Daily Climb, the free climb, free
 * 1v1, chip duels, and (once they open) tournaments.
 */

import Link from "next/link";
import { Navbar } from "../../src/components/Navbar";
import { buildMetadata } from "../../src/lib/seo";
import { CREDITS_MIN_TOPUP_CENTS } from "../../src/config/paidDuel";
import { CHIP_TIERS } from "../../src/db/chips";
import { TOURNAMENTS_COMING_SOON } from "../../src/config/tournaments";

export const metadata = buildMetadata({
  title: "Doomstack — Rules",
  description:
    "How Doomstack works: levels, the Daily Climb, the free endless climb, 1v1 races, and chip duels.",
  path: "/rules",
});

const usd = (cents: number) =>
  `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

function Well({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface-raised border border-border-subtle rounded-xl p-4 font-mono text-sm space-y-1.5">
      {children}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-signal font-semibold text-xs uppercase tracking-[0.15em] mb-3">
      {children}
    </h2>
  );
}

export default function RulesPage() {
  const chipTiers = CHIP_TIERS.map((c) => (c / 100).toLocaleString()).join(" · ");

  return (
    <div className="grain topo min-h-screen bg-void">
      <Navbar contextLabel="Rules" />
      <main id="main-content">

        <div className="max-w-2xl mx-auto px-4 py-12">
          <header className="mb-10">
            <p className="text-xs uppercase tracking-[0.2em] text-signal font-medium">
              How it works
            </p>
            <h1 className="text-3xl md:text-4xl font-bold text-text-primary tracking-tight mt-2">
              Rules
            </h1>
            <p className="text-text-secondary mt-2">
              Doomstack is a climbing game: get as high as you can before the
              rising lava catches you. Every mode is decided by how you climb,
              never by how much you spend.
            </p>
          </header>

          {/* Levels */}
          <section className="mb-8">
            <SectionHeading>Levels</SectionHeading>
            <p className="text-text-secondary text-sm mb-2">
              In the Doomstack app, each level is a tower with a diamond at the
              top. Reach it before the lava does to clear the level.
            </p>
            <ul className="text-text-secondary text-sm space-y-1.5 list-disc list-inside ml-1">
              <li>Faster clears earn up to three stars. Stars fill chests with boosters.</li>
              <li>A failed run costs a life. You have five, and one comes back every 30 minutes.</li>
            </ul>
          </section>

          {/* Daily Climb */}
          <section className="mb-8">
            <SectionHeading>The Daily Climb</SectionHeading>
            <p className="text-text-secondary text-sm mb-2">
              Everyone climbs the same tower each day, and the best heights make
              the daily board. A new tower starts at midnight UTC.
            </p>
          </section>

          {/* Free climb */}
          <section className="mb-8">
            <SectionHeading>The free climb</SectionHeading>
            <p className="text-text-secondary text-sm mb-2">
              One global leaderboard, no payment required. Climb an endless,
              procedurally generated tower — ladders, platforms, and rising lava —
              and reach the highest point you can before the lava catches you.
            </p>
            <ul className="text-text-secondary text-sm space-y-1.5 list-disc list-inside ml-1">
              <li>Your best peak height is saved as your all-time rank.</li>
              <li>Play without an account; sign in to record your peak and appear on the leaderboard.</li>
              <li>Runs are shareable as deterministic replays.</li>
            </ul>
          </section>

          {/* Free 1v1 */}
          <section className="mb-8">
            <SectionHeading>1v1 races</SectionHeading>
            <p className="text-text-secondary text-sm mb-2">
              Race a friend or a random opponent up the same tower. The higher
              peak wins. Free 1v1 races stake nothing and count toward the 1v1
              leaderboard.
            </p>
          </section>

          {/* Chip duels */}
          <section className="mb-8">
            <SectionHeading>Chip duels (ranked)</SectionHeading>
            <p className="text-text-secondary text-sm mb-3">
              A head-to-head match on the same seed: both players climb, and the
              higher peak wins the opponent&apos;s chips. It is a game of skill —
              identical starting conditions, outcome determined by play.
            </p>
            <Well>
              <div className="text-text-primary">
                tiers = {chipTiers}{" "}
                <span className="text-text-muted"># chips staked per player</span>
              </div>
              <div className="text-text-primary">
                rake = 0%{" "}
                <span className="text-text-muted"># zero-sum, no house cut</span>
              </div>
              <div className="text-text-primary">
                winner gets = loser&apos;s stake exactly
              </div>
            </Well>
            <p className="text-text-muted text-xs mt-2">
              A tie or an unplayed match refunds both players&apos; chips. Chips
              are non-cashable — they can never be converted back into real money.
            </p>
          </section>

          {/* Tournaments */}
          <section className="mb-8">
            <SectionHeading>Tournaments{TOURNAMENTS_COMING_SOON ? " (coming soon)" : ""}</SectionHeading>
            {TOURNAMENTS_COMING_SOON && (
              <p className="text-text-secondary text-sm mb-2">
                Tournaments aren&apos;t open yet. When they open, they will work
                like this.
              </p>
            )}
            <p className="text-text-secondary text-sm mb-2">
              Bracket competitions with a paid entry fee and predetermined cash
              prizes. Enter, get seeded into a bracket, and play each round
              head-to-head until a champion is crowned.
            </p>
            <ul className="text-text-secondary text-sm space-y-1.5 list-disc list-inside ml-1">
              <li>
                Entry fees are paid via Stripe Checkout. Prizes are
                company-guaranteed and paid out via Stripe Connect.
              </li>
              <li>
                Prize amounts are set before registration opens — they are not
                pooled from entry fees.
              </li>
              <li>
                Bracket sizes: 4, 8, 16, or 32 players. Non-power-of-2 counts are
                padded with byes.
              </li>
            </ul>
          </section>

          {/* Chips */}
          <section className="mb-8">
            <SectionHeading>Buying chips</SectionHeading>
            <p className="text-text-secondary text-sm mb-2">
              Chips are purchased with Stripe (minimum top-up{" "}
              {usd(CREDITS_MIN_TOPUP_CENTS)}). They are used for chip duel stakes.
            </p>
            <p className="text-text-muted text-xs mt-2">
              Chips have no cash value and cannot be withdrawn, transferred, or
              sold. You must confirm you are 18+ before your first paid match or
              tournament entry.
            </p>
          </section>

          <div className="border-t border-border-subtle pt-6">
            <Link
              href="/"
              className="inline-flex min-h-[44px] items-center text-text-muted hover:text-text-primary text-sm transition-colors"
            >
              ← Back to Doomstack
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
