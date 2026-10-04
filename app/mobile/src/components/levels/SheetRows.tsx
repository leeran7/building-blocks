import type { ReactNode } from "react";
import { StarIcon } from "./LevelBits";

/** The list sections and rows the map header's sheets (XP, chest) share. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4" aria-label={title}>
      <h3 className="mb-1.5 font-mono text-label uppercase tracking-label text-text-secondary">{title}</h3>
      <ul className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-elevated/70">{children}</ul>
    </section>
  );
}

export function Row({
  icon,
  title,
  detail,
  value,
  valueLabel,
}: {
  icon?: ReactNode;
  title: string;
  detail: string;
  value: ReactNode;
  /** The value as words, when its text reads badly aloud ("L16", "12 ★"). */
  valueLabel?: string;
}) {
  return (
    <li className="flex min-h-[52px] items-center gap-3 px-3.5 py-2">
      {icon && <span className="flex w-8 shrink-0 items-center justify-center">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-meta font-bold text-text-primary">{title}</span>
        <span className="block text-meta text-text-secondary">{detail}</span>
      </span>
      <span className="shrink-0 font-display text-meta font-black tabular-nums text-signal">
        {valueLabel ? (
          <>
            <span aria-hidden>{value}</span>
            <span className="sr-only">{valueLabel}</span>
          </>
        ) : (
          value
        )}
      </span>
    </li>
  );
}

export function StarsLeft({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      {n}
      <StarIcon filled size={13} />
    </span>
  );
}
