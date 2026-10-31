/**
 * DuelAbout — the 1v1 stack's About copy, opened from the "About" button in
 * its tab band (GameNotes), like About on /climb, /play and /daily. Facts
 * match /rules ("1v1 races", "Chip duels").
 */

import Link from "next/link";
// The public mirror, not PAID_DUELS_ENABLED: DuelStackShell also renders
// inside client components (DuelHome, ChipDuelLobby), where the server-only
// flag reads false and the text would not match the server's (hydration error).
import { PAID_DUELS_ENABLED_PUBLIC } from "../../config/paidDuel";

const LINK = "text-signal underline underline-offset-2 hover:decoration-2";

export function DuelAbout() {
  return (
    <p className="text-sm leading-relaxed text-text-secondary">
      1v1 is Doomstack&rsquo;s head-to-head mode. Race a friend or a random opponent up the
      same tower, with the same rising lava; the higher peak wins. Free 1v1 races stake nothing
      and count toward the{" "}
      <Link href="/duel/leaderboard" className={LINK}>
        1v1 leaderboard
      </Link>
      .
      {PAID_DUELS_ENABLED_PUBLIC ? (
        <>
          {" "}
          Chip duels are ranked: both players climb the same seed and the higher peak wins the
          opponent&rsquo;s stake, with no house cut.
        </>
      ) : null}{" "}
      Rather climb alone? Play{" "}
      <Link href="/play" className={LINK}>
        Endless
      </Link>{" "}
      or today&rsquo;s{" "}
      <Link href="/daily" className={LINK}>
        Daily Climb
      </Link>
      . See{" "}
      <Link href="/rules" className={LINK}>
        the rules
      </Link>{" "}
      for details.
    </p>
  );
}
