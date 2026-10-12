"use client";

import type { CSSProperties, ReactNode } from "react";
import type { PlayerState } from "../../game/types";
import type { HazardPhaseName } from "../../game/hazard";
import { ALTITUDE_UNIT, formatAltitude } from "../../lib/units";
import { isPowerUpActive } from "../../game/powerups";
import { ActivePowerStack } from "./PowerUpHud";
import { FullscreenButton } from "./FullscreenButton";
import { GameSettingsButton, type GameToggle } from "./GameSettings";
import "./expedition.css";

export function HeightInstrument({ height }: { height: number }) {
  return <section className="exp-height" aria-label={`Height ${height.toFixed(1)} feet`}>
    <span className="exp-label">HEIGHT</span>
    <div className="exp-reading"><strong>{height.toFixed(1)}</strong><span>{ALTITUDE_UNIT}</span></div>
  </section>;
}

const PHASE_LABEL: Record<HazardPhaseName, string> = {
  grace: "HOLDING",
  surge: "SURGING",
  stumble: "STUMBLING",
};

/**
 * Clearance (ft) at or under which the lava readout turns to danger: ~2.7 s
 * at a 9 ft/s ladder. The leash keeps the lava a few tens of feet behind a
 * good climber, so the old 12 ft (~1.3 s) warned too late to act on.
 */
export const LAVA_DANGER_FT = 24;

export function LavaClearanceInstrument({ clearance: rawClearance, phase, progress, hardenActive = false }: { clearance: number; phase: HazardPhaseName; progress: number; hardenActive?: boolean }) {
  const clearance = Math.max(0, rawClearance);
  const danger = clearance <= LAVA_DANGER_FT;
  const displayPhase = hardenActive ? "hardened" : phase;
  const displayLabel = hardenActive ? "HARDENED" : PHASE_LABEL[phase];
  return <section className="exp-clearance" data-danger={danger} data-phase={displayPhase} aria-label={`Lava clearance ${clearance.toFixed(1)} feet, lava ${displayLabel}`}>
    <span className="exp-label">LAVA CLEARANCE</span>
    <div className="exp-reading">
      <svg className="exp-wave" viewBox="0 0 32 28" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <path d="M1 6q4-5 8 0t8 0t8 0t8 0t6 0M1 14q4-5 8 0t8 0t8 0t6 0M1 22q4-5 8 0t8 0t8 0t6 0" />
      </svg>
      <strong>{clearance.toFixed(1)}</strong><span>{ALTITUDE_UNIT}</span>
    </div>
    <div className="exp-phase-row" data-phase={displayPhase}>
      <svg className="exp-phase-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        {hardenActive
          ? <path d="M4 14l1-5L2 7l5-1L8 1l1 5 5 1-3 2 1 5-4-3z" />
          : phase === "surge"
            ? <path d="M8 1l2.5 5H11l2 4H10l1 5H7l1-5H3l2-4H4.5z" />
            : phase === "stumble"
              ? <path d="M4 5h8v2H4zm0 4h8v2H4z" />
              : <path d="M8 2a6 6 0 100 12A6 6 0 008 2zm0 2a4 4 0 110 8A4 4 0 018 4z" />}
      </svg>
      <span className="exp-phase-label">{displayLabel}</span>
      <span className="exp-track exp-phase-track"><i style={{ width: `${(1 - progress) * 100}%` }} /></span>
    </div>
  </section>;
}

type UtilitiesProps = {
  muted: boolean;
  onToggleMute: () => void;
  /** Vibration on/off for the cog panel; only the native app has haptics to switch. */
  vibration?: GameToggle;
  fullscreenSupported?: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  backControl?: ReactNode;
  /** Passed to the settings cog: false leaves Escape unbound (web portals). */
  settingsEscapeCloses?: boolean;
};

export function UtilityControls({ muted, onToggleMute, vibration, fullscreenSupported, isFullscreen = false, onToggleFullscreen, backControl, settingsEscapeCloses }: UtilitiesProps) {
  return <div className="exp-utilities">
    {backControl}
    <GameSettingsButton muted={muted} onToggleMute={onToggleMute} vibration={vibration} escapeCloses={settingsEscapeCloses} />
    {fullscreenSupported && onToggleFullscreen && <FullscreenButton isFullscreen={isFullscreen} onToggle={onToggleFullscreen} className="exp-utility" />}
  </div>;
}

// ─────────────────────────── Duel instruments ────────────────────────────────

/** Racer entry for the duel altitude race bar. */
export interface DuelRacer {
  slot: number;
  name: string;
  y: number;
  isMe: boolean;
  isLeader: boolean;
  stale: boolean;
  ready: boolean;
}

/** Optional duel-specific data. When provided, duel instruments render. */
export interface DuelHudInfo {
  player1Name: string;
  player2Name: string;
  racers: DuelRacer[];
  maxAlt: number;
  /** Current match phase (used to gate LIVE badge to "climb"). */
  phase: string;
  /** Own connection state from the realtime transport. */
  connectionState: string;
  /** True when the opponent's live snapshots have gone quiet mid-race. */
  opponentStale: boolean;
  /** True when the opponent is present in the lobby. */
  opponentPresent: boolean;
}

/** Versus display: both player names + LIVE badge + connection status. */
function VersusInstrument({ duel }: { duel: DuelHudInfo }) {
  const showReconnecting =
    duel.connectionState === "disconnected" ||
    duel.connectionState === "suspended" ||
    duel.connectionState === "connecting";

  return (
    <div className="exp-versus" role="status">
      <div className="exp-versus-names">
        <span className="exp-versus-p1">{duel.player1Name}</span>
        <span className="exp-versus-sep">vs</span>
        <span className="exp-versus-p2">{duel.player2Name}</span>
      </div>
      <div className="exp-versus-status">
        {showReconnecting && (
          <span className="exp-versus-reconnecting motion-safe:animate-pulse" aria-live="polite">
            reconnecting&hellip;
          </span>
        )}
        {duel.phase === "climb" && duel.opponentStale && !showReconnecting && (
          <span className="exp-versus-opp-stale" role="status" aria-live="polite">
            opponent reconnecting&hellip;
          </span>
        )}
        {duel.phase === "lobby" && (
          <span className="exp-versus-lobby">
            <span className={`exp-versus-lobby-dot ${duel.opponentPresent ? "bg-signal" : "bg-text-muted motion-safe:animate-pulse"}`} aria-hidden="true" />
            {duel.opponentPresent ? "lobby" : "waiting"}
          </span>
        )}
        {duel.phase === "climb" && (
          <span className="exp-versus-live">
            <span className="exp-versus-live-dot motion-safe:animate-pulse" aria-hidden="true" />
            LIVE
          </span>
        )}
      </div>
    </div>
  );
}

/** Altitude race bars: both players' relative progress. */
function RaceProgressInstrument({ duel }: { duel: DuelHudInfo }) {
  return (
    <div className="exp-race-progress" aria-label="Altitude race">
      {duel.racers.map((racer) => {
        const pct = duel.maxAlt > 0 ? Math.round((racer.y / duel.maxAlt) * 100) : 0;
        const barColor = racer.slot === 0 ? "bg-signal" : "bg-[#6bb8ff]";
        const nameColor = racer.slot === 0 ? "text-signal" : "text-[#6bb8ff]";
        return (
          <div key={racer.slot} className="exp-race-row">
            <span
              className={`exp-race-name ${nameColor} ${racer.stale ? "opacity-50" : ""}`}
            >
              {racer.isLeader && (
                <span aria-hidden="true" className="mr-0.5">
                  &#9650;
                </span>
              )}
              {racer.name}
              {racer.isMe && <span className="text-text-muted ml-1">(you)</span>}
              {duel.phase === "lobby" && racer.ready && (
                <span className="text-signal ml-1" aria-label="ready">&#10003;</span>
              )}
            </span>
            <div
              className="exp-race-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label={`${racer.name} altitude ${formatAltitude(racer.y, 1)}${racer.isLeader ? ", leading" : ""}${racer.stale ? ", connection lost" : ""}`}
            >
              <div
                className={`exp-race-fill ${barColor} ${racer.stale ? "opacity-40" : ""}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span
              className={`exp-race-alt ${racer.stale ? "opacity-50" : ""}`}
            >
              {formatAltitude(racer.y, 1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────── Main HUD ────────────────────────────────────────

export function ExpeditionHud({ player, hazardY, tick, lavaPhase, lavaPhaseProgress, muted, onToggleMute, announcement, runId, topInset = 0, leftInset = 0, rightInset = 0, duel, goal = null, ...utilities }: UtilitiesProps & {
  player: PlayerState | undefined; hazardY: number; tick: number;
  lavaPhase: HazardPhaseName; lavaPhaseProgress: number;
  announcement: string; runId: number; topInset?: number; leftInset?: number; rightInset?: number;
  /** Optional duel-specific data. When provided, duel instruments render below the main HUD. */
  duel?: DuelHudInfo;
  /** A level's goal bar (stars and progress): drawn under the readouts, above any power-up timers. */
  goal?: ReactNode;
}) {
  const hardenActive = player ? isPowerUpActive(player, "harden-lava", tick) : false;
  const style = { "--exp-top": `${topInset}px`, "--exp-left": `${leftInset}px`, "--exp-right": `${rightInset}px` } as CSSProperties;
  return <div className="exp-hud" style={style} data-has-goal={goal ? "" : undefined}>
    <HeightInstrument height={player?.y ?? 0} />
    <LavaClearanceInstrument clearance={(player?.y ?? 0) - hazardY} phase={lavaPhase} progress={lavaPhaseProgress} hardenActive={hardenActive} />
    <UtilityControls muted={muted} onToggleMute={onToggleMute} {...utilities} />
    {goal && <div className="exp-goal">{goal}</div>}
    <ActivePowerStack player={player} tick={tick} />
    {duel && (
      <div className="exp-duel-strip">
        <VersusInstrument duel={duel} />
        <RaceProgressInstrument duel={duel} />
      </div>
    )}
    <div key={runId} className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
  </div>;
}
