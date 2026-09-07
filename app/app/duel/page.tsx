import type { Metadata } from "next";
import { DuelHome } from "../../src/components/Duel/DuelHome";
import { buildMetadata } from "../../src/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "1v1 Duel — The Climb",
  description:
    "Challenge a friend or find a random opponent for a head-to-head climb.",
  path: "/duel",
});

export default function DuelPage() {
  return <DuelHome />;
}
