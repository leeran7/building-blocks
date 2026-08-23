"use client";

/**
 * GroundRow — Ground marker at the burial altitude boundary (AC-26). V2 theme.
 *
 * Logic unchanged. Tailwind classes updated to v2 design tokens.
 * Design spec: design.md §6.15
 *
 * V2 visual: dashed danger line, inline label, gradient fade below
 */

interface GroundRowProps {
  ground: number;
  views_k: number;
}

export function GroundRow({ ground, views_k }: GroundRowProps) {
  return (
    <div
      className="relative my-2"
      role="separator"
      aria-label={`Ground level at ${ground.toFixed(2)} metres`}
      data-testid="ground-row"
    >
      {/* Dashed danger line with inline label */}
      <div className="flex items-center">
        <div className="flex-1 border-t-2 border-dashed border-danger/60" />
        <span
          className="font-mono text-sm text-danger bg-void px-2 flex-shrink-0 whitespace-nowrap"
          aria-label={`Ground level at ${ground.toFixed(2)} metres`}
        >
          Ground: {ground.toFixed(2)}m ↑
        </span>
        <div className="flex-1 border-t-2 border-dashed border-danger/60" />
      </div>

      {/* Buried zone gradient fade — indicates underground zone */}
      <div
        className="h-6 mt-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(255,68,68,0.08) 0%, transparent 100%)",
        }}
        aria-hidden="true"
      />

      {/* Views context — smaller, secondary */}
      <div className="text-center mt-1">
        <span className="text-xs text-text-muted font-mono">
          ({(views_k * 1000).toLocaleString()} views served)
        </span>
      </div>
    </div>
  );
}
