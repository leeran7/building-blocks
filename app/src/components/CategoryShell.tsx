/**
 * CategoryShell — the ONE frame shared by every category page (skill climb,
 * paid tower, play). Renders identical chrome — Navbar → CategoryNav (all 74
 * subcategories) → a centered header band (section tabs, eyebrow, title, an
 * optional action + meta) — so switching sections only swaps the panel below
 * with zero layout drift.
 *
 * `fill` towers use the viewport-height variant (their virtualized list scrolls
 * inside); everything else is a normal document-scroll column.
 */

import type { ReactNode } from "react";
import { Navbar } from "./Navbar";
import { CategoryNav } from "./CategoryNav";
import { CategorySectionTabs } from "./Climb/CategorySectionTabs";

export function CategoryShell({
  slug,
  section,
  eyebrow,
  title,
  action,
  meta,
  fill = false,
  children,
}: {
  slug: string;
  section: "climb" | "tower" | "play";
  eyebrow: string;
  title: string;
  action?: ReactNode;
  meta?: ReactNode;
  fill?: boolean;
  children: ReactNode;
}) {
  const ctxWord = section === "tower" ? "stack" : "climb";

  return (
    <div
      className={
        fill
          ? "h-[100dvh] bg-void flex flex-col overflow-hidden"
          : "min-h-screen bg-void flex flex-col"
      }
    >
      <div className="flex-shrink-0">
        <Navbar contextLabel={`${title} ${ctxWord}`} />
      </div>
      <div className="flex-shrink-0">
        <CategoryNav active={slug} section={section} />
      </div>

      {/* Header band — identical on every section. */}
      <div className="flex-shrink-0 border-b border-border-subtle">
        <div className="max-w-2xl mx-auto w-full px-4 pt-5 pb-4">
          {section === "tower" && <CategorySectionTabs towerSlug={slug} />}
          <div className="mt-5 flex items-end justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.2em] text-accent font-medium">
                {eyebrow}
              </p>
              <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight mt-1">
                {title}
              </h1>
            </div>
            {action}
          </div>
          {meta}
        </div>
      </div>

      {/* Panel. */}
      {fill ? (
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      ) : (
        <div className="max-w-2xl mx-auto w-full px-4 py-6">{children}</div>
      )}
    </div>
  );
}
