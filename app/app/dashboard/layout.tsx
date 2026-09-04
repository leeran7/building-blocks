import type { Metadata } from "next";

// /dashboard's page.tsx is "use client" and cannot export metadata directly —
// this segment layout is the standard Next.js way to attach it.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
