/**
 * /rules — how Doomstack works: the free climb, chip duels, and tournaments.
 */

import Link from "next/link";
import { Navbar } from "../../src/components/Navbar";
import { buildMetadata } from "../../src/lib/seo";
import { CREDITS_MIN_TOPUP_CENTS } from "../../src/config/paidDuel";
import { CHIP_TIERS } from "../../src/db/chips";

export const metadata = buildMetadata({
  title: "Doomstack — Rules",
  description:
    "How Doomstack works: the free skill-based climb, chip duels, and bracket tournaments.",
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
    <h3 className="text-signal font-semibold text-xs uppercase tracking-[0.15em] mb-3">
      {children}
    </h3>
  );
}

export default function RulesPage() {
  const chipTiers = CHIP_TIERS.map((c) => (c / 100).toLocaleString()).join(" · ");

  return (
    <main id="main-content" className="grain topo min-h-screen bg-void">
      <Navbar contextLabel="Rules" />

      <div className="max-w-2xl mx-auto px-4 py-12">
        <header className="mb-10">
          <p className="text-xs uppercase tracking-[0.2em] text-signal font-medium">
            How it works
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-text-primary tracking-tight mt-2">
            Rules
          </h1>
          <p className="text-text-secondary mt-2">
            Doomstack has three modes: a free skill-based climb, ranked chip
            duels, and bracket tournaments. All are decided entirely by how high
            you climb — never by how much you spend.
          </p>
        </header>

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
          <SectionHeading>Tournaments</SectionHeading>
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
            className="text-text-muted hover:text-text-primary text-sm transition-colors"
          >
            ← Back to Doomstack
          </Link>
        </div>
      </div>
    </main>
  );
}
