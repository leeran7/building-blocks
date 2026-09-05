"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavLink {
  href: string;
  label: string;
  exact?: boolean;
}

interface NavGroup {
  label: string;
  items: NavLink[];
}

const HOME: NavLink = { href: "/admin/social", label: "Dashboard", exact: true };

const GROUPS: NavGroup[] = [
  {
    label: "Create",
    items: [
      { href: "/admin/social/content", label: "Quick Create" },
      { href: "/admin/social/agent", label: "AI Assistant" },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/admin/social/calendar", label: "Calendar" },
      { href: "/admin/social/approvals", label: "Approvals" },
      { href: "/admin/social/analytics", label: "Analytics" },
    ],
  },
  {
    label: "Configure",
    items: [{ href: "/admin/social/settings", label: "Settings" }],
  },
];

export function SocialAdminNav() {
  const pathname = usePathname();

  function isActive(item: NavLink) {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href);
  }

  function linkClass(active: boolean) {
    return `flex min-h-[44px] items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      active
        ? "bg-elevated text-text-primary border border-border"
        : "text-text-muted hover:text-text-primary hover:bg-elevated/60"
    }`;
  }

  return (
    <nav className="flex min-w-[11rem] flex-col gap-1">
      <Link href={HOME.href} className={linkClass(isActive(HOME))}>
        {HOME.label}
      </Link>
      {GROUPS.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-1 pt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-text-secondary">
            {group.label}
          </p>
          <div className="flex flex-col gap-1">
            {group.items.map((item) => (
              <Link key={item.href} href={item.href} className={linkClass(isActive(item))}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
