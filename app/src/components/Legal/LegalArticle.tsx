/**
 * Shared prose primitives for /privacy and /terms — Tower Dark Editorial,
 * matching the /rules page's header/section pattern. No typography plugin;
 * classes are hand-tuned to the ASCENT tokens for long-form legal text.
 */

import type { ReactNode } from "react";

export function LegalHeader({
  eyebrow,
  title,
  updated,
}: {
  eyebrow: string;
  title: string;
  updated: string;
}) {
  return (
    <header className="mb-8">
      <p className="text-xs uppercase tracking-[0.2em] text-signal font-medium">
        {eyebrow}
      </p>
      <h1 className="text-3xl md:text-4xl font-bold text-text-primary tracking-tight mt-2">
        {title}
      </h1>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted mt-3">
        Last updated {updated}
      </p>
    </header>
  );
}

export function LegalNav({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav
      aria-label="Table of contents"
      className="mb-10 border border-border-subtle rounded-xl bg-surface-raised p-4"
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted mb-2.5">
        On this page
      </p>
      <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        {items.map((item, i) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="text-text-secondary hover:text-signal transition-colors"
            >
              {i + 1}. {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mb-9 scroll-mt-20">
      <h2 className="text-lg font-semibold text-text-primary mb-3">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-text-secondary">
        {children}
      </div>
    </section>
  );
}

export function SubHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-text-primary pt-1">{children}</h3>
  );
}

export function List({
  children,
  ordered,
}: {
  children: ReactNode;
  ordered?: boolean;
}) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag
      className={`space-y-1.5 pl-5 marker:text-text-muted ${
        ordered ? "list-decimal" : "list-disc"
      }`}
    >
      {children}
    </Tag>
  );
}

export function MailLink({ address }: { address: string }) {
  return (
    <a href={`mailto:${address}`} className="text-signal hover:underline">
      {address}
    </a>
  );
}
