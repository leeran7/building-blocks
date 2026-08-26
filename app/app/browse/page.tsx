/**
 * Browse — every category & tower in one place.
 *
 * Each family maps to a paid tower (the broad, buy-your-way-up leaderboard);
 * within it, the fine-grained categories are the free skill climbs. So this is
 * the single index of both sections of the app across all categories.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "../../src/components/Navbar";
import {
  GAME_CATEGORIES,
  FAMILIES,
  type GameCategory,
  type Family,
} from "../../src/game/categories";

export const metadata: Metadata = {
  title: "Browse all towers — Tower",
  description:
    "Every category and tower. Climb the free skill leaderboards or buy your way up the paid towers.",
};

function byFamily(): Record<Family, GameCategory[]> {
  const out = {} as Record<Family, GameCategory[]>;
  for (const f of FAMILIES) out[f] = [];
  for (const c of GAME_CATEGORIES) out[c.family].push(c);
  return out;
}

export default function BrowsePage() {
  const grouped = byFamily();

  return (
    <main className="min-h-screen bg-void">
      <Navbar contextLabel="Browse" />
      <div className="max-w-6xl mx-auto px-4 py-10">
        <header className="mb-10">
          <p className="text-xs uppercase tracking-[0.2em] text-accent font-medium">
            All towers
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-text-primary tracking-tight mt-2">
            Browse every category
          </h1>
          <p className="text-text-secondary mt-2 max-w-2xl">
            Each category has two sections: a free{" "}
            <span className="text-text-primary">skill climb</span> (rank by how
            high you climb) and a <span className="text-text-primary">paid tower</span>{" "}
            (buy your way to the top). Pick a fight.
          </p>
        </header>

        <div className="flex flex-col gap-12">
          {FAMILIES.map((family) => {
            const cats = grouped[family];
            return (
              <section key={family} aria-label={family}>
                <h2 className="text-lg font-bold text-text-primary mb-4 border-b border-border-subtle pb-2">
                  {family}
                </h2>

                <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {cats.map((c) => (
                    <li key={c.slug}>
                      <div className="group flex items-center justify-between gap-2 rounded-xl border border-border-subtle bg-surface px-4 py-3 transition-colors hover:border-accent/40">
                        <Link
                          href={`/climb/${c.slug}`}
                          className="flex items-center gap-2.5 min-w-0 flex-1"
                        >
                          <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
                          <span className="text-text-primary font-medium truncate">
                            {c.label}
                          </span>
                        </Link>
                        <div className="flex-shrink-0 flex items-center gap-1.5">
                          <Link
                            href={`/play/${c.slug}`}
                            className="rounded-full bg-accent/15 text-accent text-xs font-semibold px-3 py-1 hover:bg-accent hover:text-void transition-colors"
                            aria-label={`Play the ${c.label} climb`}
                          >
                            Play
                          </Link>
                          <Link
                            href={`/tower/${c.slug}`}
                            className="rounded-full border border-border text-text-muted text-xs font-semibold px-3 py-1 hover:text-text-primary hover:border-accent/50 transition-colors"
                            aria-label={`${c.label} paid tower`}
                          >
                            Tower
                          </Link>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
