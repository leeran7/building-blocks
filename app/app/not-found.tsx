import type { Metadata } from "next";
import { StatusPage } from "../src/components/ui/StatusPage";
import { FREE_CLIMB_HREF } from "../src/components/navLinks";

export const metadata: Metadata = {
  title: "Page not found — Doomstack",
  robots: { index: false, follow: false },
};

/** Every unknown path and every notFound() (a creator handle nobody owns). */
export default function NotFound() {
  return (
    <StatusPage
      eyebrow="404"
      title="Page not found"
      primary={{ label: "Play the climb", href: FREE_CLIMB_HREF }}
      secondary={{ label: "Go home", href: "/" }}
    >
      <p>That link is old or mistyped. The climb is still here.</p>
    </StatusPage>
  );
}
