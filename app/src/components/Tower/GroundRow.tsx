"use client";

/**
 * GroundRow — Ground marker at the burial altitude boundary (AC-26).
 *
 * Shows: current ground altitude and rising indicator.
 * The soil slab below this row fills everything below ground level.
 */

interface GroundRowProps {
  ground: number;
  views_k: number;
}

export function GroundRow({ ground, views_k }: GroundRowProps) {
  return (
    <div
      className="ground-line relative"
      role="separator"
      aria-label={`Ground level at ${ground.toFixed(2)}m — blocks below this line are buried`}
      data-testid="ground-row"
    >
      {/* Ground line label */}
      <div className="flex items-center gap-3 px-4 py-2">
        <span className="text-xs text-amber-400 font-bold tracking-widest uppercase">
          ↑ GROUND {ground.toFixed(2)}m
        </span>
        <span className="text-xs text-amber-600">
          ({(views_k * 1000).toLocaleString()} views served)
        </span>
        <span className="text-xs text-amber-500 animate-pulse">⬆ rising</span>
      </div>

      {/* Soil slab visual indicator */}
      <div
        className="absolute inset-x-0 bottom-0 h-1"
        style={{
          background:
            "linear-gradient(90deg, #78350f, #92400e, #78350f)",
        }}
        aria-hidden="true"
      />
    </div>
  );
}
