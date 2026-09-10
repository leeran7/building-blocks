import type { Metadata } from "next";
import { buildMetadata } from "../../../src/lib/seo";
import { ChipDuelLobby } from "../../../src/components/Duel/ChipDuelLobby";

export const metadata: Metadata = buildMetadata({
  title: "Chip Duels — Doomstack",
  description:
    "Stake non-cashable chips in a ranked 1v1 duel. Zero-sum — winner takes all.",
  path: "/duel/chips",
});

export default function ChipDuelsPage() {
  return <ChipDuelLobby />;
}
