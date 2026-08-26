"use client";

/**
 * RecordStats — the permanent record dossier for a block (AC-38), ASCENT design.
 *
 * Reads as an instrument dossier: bracketed mono eyebrow, huge signal elevation
 * centerpiece, display-font name, and a cockpit gauge grid of stats over a
 * survey-grid card. Ember marks a buried block. All logic + data-testids preserved.
 */

interface RecordStatsProps {
  display_name: string;
  url: string;
  slug: string;
  altitude: number;
  peak_rank: number | null;
  views_served: number;
  clicks: number;
  total_spend_cents: number;
  seasons_appeared: number;
  buried: boolean;
  hidden: boolean;
  categoryLabel?: string;
}

export function RecordStats({
  display_name,
  url,
  altitude,
  peak_rank,
  views_served,
  clicks,
  total_spend_cents,
  seasons_appeared,
  buried,
  hidden,
  categoryLabel,
}: RecordStatsProps) {
  const totalSpendUsd = (total_spend_cents / 100).toFixed(2);

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div
        className={[
          "relative overflow-hidden rounded-2xl border p-6 md:p-8 mb-6 shadow-lifted",
          buried ? "border-ember/40 bg-surface" : "border-border-strong bg-surface edge-signal",
        ].join(" ")}
      >
        {/* survey-grid backdrop */}
        <div className="pointer-events-none absolute inset-0 survey-grid opacity-50" />
        {/* rising ground for buried blocks */}
        {buried && (
          <div
            className="ground-gradient animate-groundRise pointer-events-none absolute inset-x-0 bottom-0 h-20 opacity-60"
            aria-hidden="true"
          />
        )}

        <div className="relative">
          {/* Chips */}
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-signal">
              [ permanent record ]
            </span>
            {categoryLabel && (
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary bg-surface-raised border border-border-strong rounded-full px-2.5 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-signal" aria-hidden="true" />
                {categoryLabel}
              </span>
            )}
            {buried && (
              <span className="font-mono text-[10px] font-semibold border border-ember/40 text-ember bg-ember/10 rounded-full px-2.5 py-1 uppercase tracking-[0.12em]">
                Buried
              </span>
            )}
            {hidden && (
              <span className="font-mono text-[10px] font-semibold border border-border-strong text-text-muted rounded-full px-2.5 py-1 uppercase tracking-[0.12em]">
                Hidden
              </span>
            )}
          </div>

          {/* Altitude centerpiece */}
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted mb-1">
            Current elevation
          </p>
          <span
            className={[
              "font-mono text-6xl md:text-7xl font-bold tabular-nums leading-none",
              buried ? "text-ember" : "text-signal",
            ].join(" ")}
            aria-label={`Current altitude: ${altitude.toFixed(1)} metres`}
          >
            {altitude.toFixed(1)}
            <span className="text-2xl text-text-muted font-normal ml-1">m</span>
          </span>

          {/* Name + outbound */}
          <h1 className="font-display text-3xl md:text-4xl text-text-primary mt-6">
            {display_name}
          </h1>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-signal hover:brightness-110 text-sm break-all font-mono mt-1.5"
            aria-label={`Visit ${display_name} (opens external site)`}
            data-testid="record-outbound-link"
          >
            {url} ↗
          </a>

          {/* Stats grid — cockpit gauge cluster (AC-38) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-px overflow-hidden rounded-xl border border-border-subtle bg-border-subtle mt-7">
            <StatCard label="Peak rank" value={peak_rank ? `#${peak_rank}` : "—"} testId="record-peak-rank" accent />
            <StatCard label="Altitude" value={`${altitude.toFixed(2)}m`} testId="record-altitude" />
            <StatCard label="Views served" value={views_served.toLocaleString()} testId="record-views-served" />
            <StatCard label="Clicks" value={clicks.toLocaleString()} testId="record-clicks" />
            <StatCard label="Total spend" value={`$${totalSpendUsd}`} testId="record-total-spend" />
            <StatCard label="Seasons" value={String(seasons_appeared)} testId="record-seasons" />
          </div>

          <div className="pt-5 mt-6 border-t border-border-subtle">
            <a
              href="/"
              className="font-mono text-xs uppercase tracking-[0.14em] text-text-muted hover:text-signal transition-colors"
            >
              ← Back to Stack
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  testId,
  accent = false,
}: {
  label: string;
  value: string;
  testId: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-surface px-4 py-3.5" data-testid={testId}>
      <div className="font-mono text-[10px] text-text-muted uppercase tracking-[0.12em] mb-1.5">
        {label}
      </div>
      <div
        className={[
          "text-lg font-mono font-bold tabular-nums",
          accent ? "text-signal" : "text-text-primary",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}
