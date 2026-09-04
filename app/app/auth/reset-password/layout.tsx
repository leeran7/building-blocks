import type { Metadata } from "next";

// Token-bearing transactional page — never worth indexing. page.tsx is "use
// client" and cannot export metadata directly, hence this segment layout.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
