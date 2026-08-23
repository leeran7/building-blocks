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
      <div className="bg-elevated rounded-lg px-4 py-3 text-center">
        <p className="text-sm text-text-muted italic">
          You are rank #1 in {category}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-elevated rounded-lg px-4 py-3 text-center">
      <p className="text-xs text-text-muted uppercase tracking-wider mb-1">
        To overtake rank #{rank - 1}
      </p>
      <p className="font-mono text-xl font-bold text-text-primary">
        ${competitorCostUsd.toFixed(2)}
      </p>
    </div>
  );
}
