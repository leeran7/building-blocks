/**
 * ClimbControlsGuide — keyboard controls + gameplay tips for The Climb.
 *
 * Shown on the play page and in the pre-start lobby overlay. Separates
 * movement, ladder climbing, and jump so players understand the Donkey-Kong
 * style controls (walk + jump on platforms, up/down on ladders).
 */

import type { ReactNode } from "react";

type Variant = "card" | "compact" | "overlay";

const CONTROLS = [
  {
    label: "Move",
    keys: ["←", "→", "A", "D"],
    detail: "Walk left and right on platforms",
  },
  {
    label: "Jump",
    keys: ["Space"],
    detail: "Leap across gaps between platforms",
  },
  {
    label: "Climb",
    keys: ["↑", "↓", "W", "S"],
    detail: "Up/down on ladders — stand on a ladder first",
  },
] as const;

const TIPS = [
  "Grab a ladder and hold ↑ to climb faster than jumping floor to floor.",
  "The lava rises steadily — keep moving upward; your peak height is your score.",
  "Sign in after a run to save your rank on the free leaderboard.",
] as const;

export function ClimbControlsGuide({ variant = "card" }: { variant?: Variant }) {
  if (variant === "compact") {
    return (
      <p className="text-sm text-text-secondary leading-relaxed">
        <span className="text-text-primary font-medium">Controls:</span>{" "}
        <Key>←</Key>/<Key>→</Key> or <Key>A</Key>/<Key>D</Key> move ·{" "}
        <Key>Space</Key> jump · <Key>↑</Key>/<Key>↓</Key> or <Key>W</Key>/<Key>S</Key> climb
        ladders
      </p>
    );
  }

  if (variant === "overlay") {
    return (
      <div className="mt-5 w-full max-w-[280px] text-left">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted mb-2">
          Controls
        </p>
        <ul className="space-y-2">
          {CONTROLS.map((c) => (
            <li key={c.label} className="flex items-start gap-2.5">
              <span className="flex-shrink-0 w-14 font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted pt-1">
                {c.label}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap gap-1">
                  {c.keys.map((k) => (
                    <Key key={k}>{k}</Key>
                  ))}
                </div>
                <p className="text-[11px] text-text-muted mt-1 leading-snug">{c.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <section
      aria-label="How to play"
      className="rounded-2xl border border-border-subtle bg-surface/60 p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-signal">
          [ how to play ]
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {CONTROLS.map((c) => (
          <div key={c.label} className="rounded-xl border border-border-subtle bg-void/40 p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
              {c.label}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {c.keys.map((k) => (
                <Key key={k}>{k}</Key>
              ))}
            </div>
            <p className="text-xs text-text-secondary mt-2 leading-relaxed">{c.detail}</p>
          </div>
        ))}
      </div>

      <ul className="mt-5 space-y-2 border-t border-border-subtle pt-4">
        {TIPS.map((tip) => (
          <li key={tip} className="flex gap-2 text-xs text-text-secondary leading-relaxed">
            <span className="text-signal flex-shrink-0" aria-hidden="true">
              ·
            </span>
            {tip}
          </li>
        ))}
      </ul>

      <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
        Desktop keyboard recommended · mobile controls planned
      </p>
    </section>
  );
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-1.5 rounded-md border border-border-strong bg-surface font-mono text-[11px] font-semibold text-text-primary shadow-[0_1px_0_0_rgb(55_52_63)]">
      {children}
    </kbd>
  );
}
