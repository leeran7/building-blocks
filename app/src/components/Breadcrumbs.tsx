import Link from "next/link";
import { absoluteUrl } from "../lib/seo";
import { JsonLd } from "./JsonLd";

export interface Crumb {
  label: string;
  href: string;
}

/**
 * Visible breadcrumb trail + its matching BreadcrumbList JSON-LD, built from
 * the same `items` array so the two can never drift apart.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const jsonLd = {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      item: absoluteUrl(item.href),
    })),
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <nav aria-label="Breadcrumb" className="font-mono text-xs uppercase tracking-wide text-text-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          {items.map((item, i) => {
            const isLast = i === items.length - 1;
            return (
              <li key={item.href} className="flex items-center gap-1.5">
                {isLast ? (
                  <span aria-current="page" className="text-text-secondary">
                    {item.label}
                  </span>
                ) : (
                  <>
                    <Link href={item.href} className="transition-colors hover:text-signal">
                      {item.label}
                    </Link>
                    <span aria-hidden="true">/</span>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
