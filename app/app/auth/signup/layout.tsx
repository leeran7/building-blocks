import type { Metadata } from "next";
import { buildMetadata } from "../../../src/lib/seo";

// page.tsx is "use client" and cannot export metadata directly, hence this
// segment layout.
export const metadata: Metadata = buildMetadata({
  title: "Sign Up — Doomstack",
  description: "Create a Doomstack account to save your free-climb peak height and submit paid stack blocks.",
  path: "/auth/signup",
});

export default function SignUpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
