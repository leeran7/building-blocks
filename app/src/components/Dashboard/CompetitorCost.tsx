/**
 * CompetitorCost — Displays cost to overtake the block above in rank.
 *
 * Design spec: design.md §6.19
 * AC-24: Shows cost to overtake rank above (not rank 1)
 * AC-25: Shows "You are rank #1" when rank = 1
 *
 * WCAG: font-mono for numbers, text-primary for readability
 */

interface CompetitorCostProps {
  competitorCostUsd: number | null;
  rank: number;
  category: string;
}

export function CompetitorCost({
  competitorCostUsd,
  rank,
  category,
}: CompetitorCostProps) {
  // AC-25: Rank 1 — no competitor cost
  if (rank === 1 || competitorCostUsd === null) {
    return (
      <div className="rounded-lg border border-signal/25 bg-signal/[0.06] px-4 py-3 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-signal">
          ▲ You hold #1 in {category}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-raised px-4 py-3 text-center">
      <p className="font-mono text-[10px] text-text-muted uppercase tracking-[0.14em] mb-1">
        To overtake rank #{rank - 1}
      </p>
      <p className="font-mono text-xl font-bold text-signal tabular-nums">
        ${competitorCostUsd.toFixed(2)}
      </p>
    </div>
  );
}
