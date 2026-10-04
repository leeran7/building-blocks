"use client";

/**
 * The in-game settings cog: one HUD button that opens a small panel with game
 * sound, vibration where the host app has haptics, and, on touch devices, the
 * control layout. It replaces the bare mute button so these can be changed
 * mid-run without leaving the climb.
 *
 * The run keeps going while the panel is open (live climbs and duels have no
 * pause), so it is a popover under the cog, not a full-screen sheet.
 */

import { useEffect, useId, useRef, useState } from "react";
import { ControlSchemePicker } from "../ControlSchemePicker";
import { useCoarsePointer } from "../../hooks/useCoarsePointer";

/** An on/off preference the host app owns, such as vibration on native. */
export interface GameToggle {
  enabled: boolean;
  onToggle: () => void;
}

export function GameSettingsButton({
  muted,
  onToggleMute,
  vibration,
}: {
  muted: boolean;
  onToggleMute: () => void;
  vibration?: GameToggle;
}) {
  const [open, setOpen] = useState(false);
  // Which edge the panel hangs from: the cog sits top-left in some HUD layouts
  // and top-right in others, and the panel must open toward the screen.
  const [side, setSide] = useState<"left" | "right">("right");
  const touch = useCoarsePointer();
  const wrapRef = useRef<HTMLDivElement>(null);
  const cogRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const controlsLabelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      cogRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="exp-settings">
      <button
        ref={cogRef}
        type="button"
        data-game-control
        className="exp-utility"
        onClick={() => {
          const r = cogRef.current?.getBoundingClientRect();
          if (r) setSide(r.left + r.width / 2 < window.innerWidth / 2 ? "left" : "right");
          setOpen((o) => !o);
        }}
        onContextMenu={(e) => e.preventDefault()}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Game settings"
        title="Game settings"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
        </svg>
      </button>
      {open && (
        <div id={panelId} role="group" aria-label="Game settings" data-side={side} className="exp-settings-panel">
          <SwitchRow label="Sound" on={!muted} onToggle={onToggleMute} />
          {vibration && <SwitchRow label="Vibration" on={vibration.enabled} onToggle={vibration.onToggle} />}
          {touch && (
            <div className="mt-2 border-t border-white/10 pt-3">
              <p id={controlsLabelId} className="mb-2 px-1 text-sm font-semibold text-text-primary">
                Controls
              </p>
              <ControlSchemePicker labelledBy={controlsLabelId} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SwitchRow({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-1 text-left text-sm font-semibold text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
    >
      {label}
      <span aria-hidden="true" className={`font-mono text-xs uppercase tracking-[0.14em] ${on ? "text-signal" : "text-text-secondary"}`}>
        {on ? "On" : "Off"}
      </span>
    </button>
  );
}
