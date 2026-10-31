/**
 * Disclosure — the site's one collapsible card (native <details>/<summary>,
 * same look as the landing FAQ). Closed by default; the content stays in the
 * DOM, so it is crawlable copy and works without client JS.
 *
 * Full width of its column: the page decides the width, so stacked
 * disclosures always line up with each other and with the content above.
 */

import type { ReactNode } from "react";
import { Chevron } from "../Chevron";

export function Disclosure({
  title,
  className = "",
  children,
}: {
  title: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <details
      className={`group w-full rounded-xl border border-border-subtle bg-surface px-5 py-4 transition-colors hover:border-border-strong open:border-signal/40 ${className}`}
    >
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-3 text-sm font-semibold text-text-primary [&::-webkit-details-marker]:hidden">
        <span className="flex-1">{title}</span>
        <Chevron />
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
