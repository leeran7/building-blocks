import type { Metadata } from "next";
import { buildMetadata } from "../../../src/lib/seo";

// page.tsx is "use client" and cannot export metadata directly, hence this
// segment layout.
export const metadata: Metadata = buildMetadata({
  title: "Sign In — Doomstack",
  description: "Sign in to Doomstack to save your free-climb peak height and manage your paid stacks.",
  path: "/auth/signin",
});

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return children;
}
