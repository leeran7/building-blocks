/**
 * BurialRisk — Displays burial risk meter for a block on the dashboard.
 *
 * Design spec: design.md §6.18
 * AC-21: Days formula displayed
 * AC-22: Buried state shows "Buried" not negative number
 * AC-23: "Safe" when burial_risk_days = null
 *
 * WCAG: Color + text label (never color alone)
 */

interface BurialRiskProps {
  burialRiskDays: number | null;
  buried: boolean;
  amberEdge: boolean;
}

export function BurialRisk({
  burialRiskDays,
  buried,
  amberEdge,
}: BurialRiskProps) {
  // AC-22: Buried state
  if (buried) {
    return (
      <div>
        <p className="text-xs text-text-muted uppercase tracking-wider mb-2">
          Burial risk
        </p>
        <p
          className="text-sm font-semibold text-danger"
          aria-live="polite"
        >
          Buried
        </p>
      </div>
    );
  }

  // AC-23: Safe — will not be buried this season
  if (burialRiskDays === null) {
    return (
      <div>
        <p className="text-xs text-text-muted uppercase tracking-wider mb-2">
          Burial risk
        </p>
        <p className="text-sm text-success">
          Safe — will not be buried this season
        </p>
      </div>
    );
  }

  // Color: green >14 days, amber 1–14 days, red 0
  const barColor =
    burialRiskDays > 14
      ? "#00cc66"      // success
      : burialRiskDays > 0
        ? "#f59e0b"    // amber
        : "#ff4444";   // danger

  const textColor =
    burialRiskDays > 14
      ? "text-text-primary"
      : "text-danger"; // amber or red — high urgency per spec

  // Fill width: scale 0-100 over 30 days
  const fillPct = Math.min(100, (burialRiskDays / 30) * 100);

  return (
    <div>
      <p className="text-xs text-text-muted uppercase tracking-wider mb-2">
        Burial risk
      </p>

      {/* Meter bar */}
      <div
        role="meter"
        aria-valuenow={burialRiskDays}
        aria-valuemin={0}
        aria-valuemax={999}
        aria-label={`Burial risk: ${burialRiskDays} days remaining`}
        className="w-full h-2 bg-border-subtle rounded-full overflow-hidden mb-1.5"
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${fillPct}%`, backgroundColor: barColor }}
        />
      </div>

      <p className={`text-sm font-mono ${textColor}`}>
        {burialRiskDays} {burialRiskDays === 1 ? "day" : "days"} until burial
      </p>
    </div>
  );
}
