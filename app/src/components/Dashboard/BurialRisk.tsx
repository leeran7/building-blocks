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
  const LABEL = "font-mono text-[10px] text-text-muted uppercase tracking-[0.14em] mb-2";

  // AC-22: Buried state
  if (buried) {
    return (
      <div>
        <p className={LABEL}>Burial risk</p>
        <p className="text-sm font-semibold text-ember" aria-live="polite">
          ▼ Buried
        </p>
      </div>
    );
  }

  // AC-23: Safe — will not be buried this season
  if (burialRiskDays === null) {
    return (
      <div>
        <p className={LABEL}>Burial risk</p>
        <p className="text-sm text-success">
          Safe — will not be buried this season
        </p>
      </div>
    );
  }

  // Color: success >14 days, warning 1–14 days, ember 0
  const barColor =
    burialRiskDays > 14
      ? "#8fd14f"      // success
      : burialRiskDays > 0
        ? "#ffb020"    // warning
        : "#ff5a2c";   // ember

  const textColor =
    burialRiskDays > 14
      ? "text-text-primary"
      : "text-ember"; // amber or red — high urgency per spec

  // Fill width: scale 0-100 over 30 days
  const fillPct = Math.min(100, (burialRiskDays / 30) * 100);

  return (
    <div>
      <p className={LABEL}>Burial risk</p>

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

      <p className={`text-sm font-mono tabular-nums ${textColor}`}>
        {burialRiskDays} {burialRiskDays === 1 ? "day" : "days"} until burial
      </p>
    </div>
  );
}
