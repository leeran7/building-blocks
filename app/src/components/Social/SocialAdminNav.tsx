"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin/social", label: "Overview", exact: true },
  { href: "/admin/social/content", label: "Content Studio" },
  { href: "/admin/social/calendar", label: "Calendar" },
  { href: "/admin/social/approvals", label: "Approvals" },
  { href: "/admin/social/analytics", label: "Analytics" },
  { href: "/admin/social/agent", label: "Marketing Agent" },
  { href: "/admin/social/settings", label: "Settings" },
];

export function SocialAdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 min-w-[11rem]">
      {NAV.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-elevated text-text-primary border border-border"
                : "text-text-muted hover:text-text-primary hover:bg-elevated/60"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
