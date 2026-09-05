"use client";

/**
 * Shared Quick Create / AI Assistant comparison strip (loop/design.md §0.2,
 * §7.3). Static copy, collapsed by default — no data fetch, no props.
 */

const ROWS: Array<{ label: string; quickCreate: boolean; aiAssistant: boolean }> = [
  { label: "One-prompt drafts", quickCreate: true, aiAssistant: true },
  { label: "Uses a replay", quickCreate: false, aiAssistant: true },
  { label: "Repurpose across formats", quickCreate: false, aiAssistant: true },
  { label: "Schedule & publish", quickCreate: false, aiAssistant: true },
  { label: "Strategy from analytics", quickCreate: false, aiAssistant: true },
];

export function CapabilityCompare() {
  return (
    <details className="group rounded-xl border border-border bg-elevated px-4 py-3 open:pb-4">
      <summary
        className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 text-sm text-text-secondary [&::-webkit-details-marker]:hidden focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void rounded"
      >
        <span>Not sure which to use?</span>
        <span className="flex items-center gap-1 font-mono text-xs uppercase tracking-wide">
          Compare
          <span className="inline-block transition-transform group-open:rotate-180" aria-hidden="true">
            ▾
          </span>
        </span>
      </summary>
      <div className="mt-3 overflow-x-auto" aria-live="off">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-text-secondary">
              <th className="py-1 pr-3 font-normal" scope="col">
                <span className="sr-only">Capability</span>
              </th>
              <th className="py-1 px-3 font-normal" scope="col">
                Quick Create
              </th>
              <th className="py-1 px-3 font-normal" scope="col">
                AI Assistant
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className="border-t border-border-subtle">
                <th scope="row" className="py-2 pr-3 text-left font-normal text-text-primary">
                  {row.label}
                </th>
                <td className="py-2 px-3 text-center">{row.quickCreate ? <Check /> : <Dash />}</td>
                <td className="py-2 px-3 text-center">{row.aiAssistant ? <Check /> : <Dash />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Check() {
  return (
    <span className="text-success" aria-label="yes">
      ✓
    </span>
  );
}

function Dash() {
  return (
    <span className="text-text-secondary" aria-label="no">
      –
    </span>
  );
}
