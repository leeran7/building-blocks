"use client";

/**
 * ClimbControlsGuide — keyboard or touch controls + gameplay tips for The Climb.
 */

import type { ReactNode } from "react";
import { useCoarsePointer } from "../../hooks/useCoarsePointer";
import {
  JETPACK_MAX_VY,
  POWER_UP_SPECS,
  POWER_UP_TYPES,
  type PowerUpSpec,
} from "../../game/powerups";
import { PowerUpTypeIcon } from "./PowerUpTypeIcon";

type Variant = "card" | "compact" | "overlay";

const KEYBOARD_CONTROLS = [
  {
    label: "Move",
    keys: ["←", "→", "A", "D"],
    detail: "Walk left and right on platforms",
  },
  {
    label: "Jump",
    keys: ["Space"],
    detail: "Tap Space to leap; re-hold in the air to thrust a jetpack",
  },
  {
    label: "Climb",
    keys: ["↑", "↓", "W", "S"],
    detail: "Up/down on ladders — stand on a ladder first",
  },
] as const;

const TOUCH_CONTROLS = [
  { label: "Move", detail: "Tap and hold ← → at the bottom of the screen" },
  { label: "Jump", detail: "Tap JMP to leap; re-hold JMP in the air to thrust" },
  { label: "Climb", detail: "Hold ↑ climb when you're on a ladder" },
] as const;

const TIPS = [
  "Grab a ladder and climb to go faster than jumping floor to floor.",
  "The lava surges, then stumbles — use the slow windows to climb; your peak height is your score.",
  "Crates on a floor block the walk — jump a hurdle, walk a three-crate triangle, or climb a stacked stair to the next floor.",
  "Walk into a glowing orb to trigger its power-up instantly.",
  "Power-ups activate the instant you touch them — time your route to grab one right when you need it.",
  `Tap jump to leap, then re-hold in the air to burn a jetpack; holding through takeoff caps rise at ${JETPACK_MAX_VY} m/s. Fuel is short, leftover dies with the window.`,
  "Sign in after a run to save your rank on the free leaderboard.",
] as const;

export function ClimbControlsGuide({ variant = "card" }: { variant?: Variant }) {
  const touch = useCoarsePointer();

  if (variant === "compact") {
    return touch ? (
      <p className="text-sm text-text-secondary leading-relaxed">
        <span className="text-text-primary font-medium">Touch controls:</span>{" "}
        hold ← → to move · hold ↑ climb on ladders · tap JMP to jump · re-hold
        JMP in the air to thrust
      </p>
    ) : (
      <p className="text-sm text-text-secondary leading-relaxed">
        <span className="text-text-primary font-medium">Controls:</span>{" "}
        <Key>←</Key>/<Key>→</Key> or <Key>A</Key>/<Key>D</Key> move ·{" "}
        <Key>Space</Key> jump · re-hold <Key>Space</Key> in the air to thrust ·{" "}
        <Key>↑</Key>/<Key>↓</Key> or <Key>W</Key>/<Key>S</Key> climb ladders
      </p>
    );
  }

  if (variant === "overlay") {
    return (
      <div className="mt-5 w-full max-w-[280px] text-left">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-secondary mb-2">
          {touch ? "Touch controls" : "Controls"}
        </p>
        <ul className="space-y-2">
          {touch
            ? TOUCH_CONTROLS.map((c) => (
                <li key={c.label} className="flex items-start gap-2.5">
                  <span className="flex-shrink-0 w-14 font-mono text-[10px] uppercase tracking-[0.1em] text-text-secondary pt-0.5">
                    {c.label}
                  </span>
                  <p className="text-[11px] text-text-secondary leading-snug">{c.detail}</p>
                </li>
              ))
            : KEYBOARD_CONTROLS.map((c) => (
                <li key={c.label} className="flex items-start gap-2.5">
                  <span className="flex-shrink-0 w-14 font-mono text-[10px] uppercase tracking-[0.1em] text-text-secondary pt-1">
                    {c.label}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-1">
                      {c.keys.map((k) => (
                        <Key key={k}>{k}</Key>
                      ))}
                    </div>
                    <p className="text-[11px] text-text-secondary mt-1 leading-snug">{c.detail}</p>
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

      {touch ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {TOUCH_CONTROLS.map((c) => (
            <div key={c.label} className="rounded-xl border border-border-subtle bg-void/40 p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
                {c.label}
              </p>
              <p className="text-xs text-text-secondary mt-2 leading-relaxed">{c.detail}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {KEYBOARD_CONTROLS.map((c) => (
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
      )}

      <div className="mt-5 border-t border-border-subtle pt-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
          Power-ups
        </p>
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {POWER_UP_TYPES.map((type) => {
            const spec = POWER_UP_SPECS[type];
            return (
              <li key={type} className="flex items-start gap-2.5">
                <span
                  className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border"
                  style={{ borderColor: spec.color, color: spec.color }}
                  aria-hidden="true"
                >
                  <span className="inline-flex h-4 w-4">
                    <PowerUpTypeIcon type={type} />
                  </span>
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-text-primary">{spec.label}</p>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    {spec.description}
                    <span className="text-text-muted">
                      {" · "}
                      {durationSuffix(spec)}
                    </span>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
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

      {!touch && (
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
          Keyboard controls · use a desktop for the best experience
        </p>
      )}
    </section>
  );
}

function durationSuffix(spec: PowerUpSpec): string {
  let body: string;
  if (spec.fuelSeconds != null) {
    body = `${spec.fuelSeconds}s fuel · ${spec.durationSeconds}s window`;
  } else {
    body = `${spec.durationSeconds}s`;
  }
  if (spec.cooldownSeconds > 0) {
    return `${body} · ${spec.cooldownSeconds}s recharge`;
  }
  return body;
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-1.5 rounded-md border border-border-strong bg-surface font-mono text-[11px] font-semibold text-text-primary shadow-[0_1px_0_0_rgb(55_52_63)]">
      {children}
    </kbd>
  );
}
