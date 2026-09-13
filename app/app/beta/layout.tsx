import type { Metadata } from "next";
import { buildMetadata } from "../../src/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Join the Beta — Doomstack",
  description: "Get early access to the Doomstack native app for iOS and Android.",
  path: "/beta",
});

export default function BetaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
