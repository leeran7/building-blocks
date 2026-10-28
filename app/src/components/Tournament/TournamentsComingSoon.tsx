import { StatusPage } from "../ui/StatusPage";
import { DUEL_HREF } from "../navLinks";

/** While entry is closed on the server, the page says so instead of asking for a sign-in. */
export function TournamentsComingSoon() {
  return (
    <StatusPage
      contextLabel="Tournaments"
      eyebrow="Coming soon"
      title="Tournaments"
      primary={{ label: "Play a 1v1", href: DUEL_HREF }}
      secondary={{ label: "Go home", href: "/" }}
    >
      <p>Bracket tournaments aren&apos;t open yet. Until they are, race a friend or a random opponent in a 1v1.</p>
    </StatusPage>
  );
}
