/**
 * AboutDoomstack — crawlable brand-prose section for the landing page.
 *
 * SEO purpose: give Google a block of plain, keyword-honest copy that names the
 * brand ("Doomstack") in an <h2> and body text, and explicitly frames it as *a
 * game you play in the browser*. "Doomstack" is entrenched strategy-gaming
 * jargon (Total War / Stellaris / Paradox) plus a Steam title ("Doomstacker"),
 * so the branded query needs on-page relevance the punchy hero H1
 * ("CLIMB. OR GET BURIED.") deliberately doesn't carry. Pairs with the
 * VideoGame JSON-LD node (see src/lib/seo.ts).
 *
 * Server component. Links are real internal routes so this doubles as a
 * crawlable internal-link hub to the core pages.
 */

import Link from "next/link";

export function AboutDoomstack() {
  return (
    <section
      aria-labelledby="about-doomstack-heading"
      className="scroll-reveal py-20 px-4 border-t border-border-subtle"
    >
      <div className="max-w-3xl mx-auto">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
          [ what is this ]
        </span>
        <h2
          id="about-doomstack-heading"
          className="font-display text-4xl md:text-5xl text-text-primary mt-3"
        >
          What is Doomstack?
        </h2>

        <div className="mt-6 space-y-4 text-text-secondary text-base leading-relaxed">
          <p>
            <strong className="font-semibold text-text-primary">Doomstack</strong>{" "}
            is a free, skill-based climbing game you play right in your browser —
            no download, no install. You climb an endless tower while the ground
            rises to bury you: reach as high as you can before the lava catches
            up. Your best height is your rank.
          </p>
          <p>
            Play the{" "}
            <Link href="/play" className="text-signal underline-offset-4 hover:underline">
              free solo climb
            </Link>{" "}
            for the global leaderboard, or go head-to-head in a{" "}
            <Link href="/duel" className="text-signal underline-offset-4 hover:underline">
              real-time 1v1 duel
            </Link>{" "}
            — you and your opponent race the exact same tower with the same
            rising lava, and the last climber standing wins. Duels are decided by
            your climb, not by chance.
          </p>
          <p>
            Curious how the burial and season math works? It&apos;s all spelled
            out on the{" "}
            <Link href="/rules" className="text-signal underline-offset-4 hover:underline">
              rules page
            </Link>
            . Doomstack is free to play and free to share — grab a challenge link
            and see who outlasts the climb.
          </p>
        </div>
      </div>
    </section>
  );
}
