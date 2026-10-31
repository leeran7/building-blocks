/**
 * The Daily Climb's About copy, opened from the band's About button on both
 * Daily pages (/daily and /daily/leaderboard). Server-rendered into the closed
 * dialog, so it stays crawlable.
 */

import Link from "next/link";
import { DAILY_LEADERBOARD_HREF, ENDLESS_LEADERBOARD_HREF } from "../navLinks";

const LINK = "text-signal underline underline-offset-2 hover:decoration-2";

export function DailyAbout() {
  return (
    <p className="text-sm leading-relaxed text-text-secondary">
      The Daily Climb gives every player the same procedurally generated tower
      each calendar day — one seed, so it&rsquo;s a fair, shared challenge.
      Climb as high as you can before the rising lava catches you; your best
      height today ranks on{" "}
      <Link href={DAILY_LEADERBOARD_HREF} className={LINK}>
        today&rsquo;s leaderboard
      </Link>{" "}
      and counts on the{" "}
      <Link href={ENDLESS_LEADERBOARD_HREF} className={LINK}>
        Endless leaderboard
      </Link>{" "}
      too. Play it every day to build a streak — miss a day and the streak
      resets. The daily tower rolls over at midnight UTC. Prefer an endless run
      on a fresh random tower each time, or a head-to-head race? Pick Endless or
      1v1 at the top of the page.
    </p>
  );
}
