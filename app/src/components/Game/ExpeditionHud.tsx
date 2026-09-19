"use client";

import type { CSSProperties, ReactNode } from "react";
import type { PlayerState } from "../../game/types";
import type { HazardPhaseName } from "../../game/hazard";
import { ALTITUDE_UNIT, formatAltitude } from "../../lib/units";
import { ActivePowerStack } from "./PowerUpHud";
import { FullscreenButton } from "./FullscreenButton";
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

export function LavaClearanceInstrument({ clearance, phase, progress }: { clearance: number; phase: HazardPhaseName; progress: number }) {
  const danger = clearance <= 12;
  return <section className="exp-clearance" data-danger={danger} data-phase={phase} aria-label={`Lava clearance ${clearance.toFixed(1)} feet, lava ${PHASE_LABEL[phase]}`}>
    <span className="exp-label">LAVA CLEARANCE</span>
    <div className="exp-reading">
      <svg className="exp-wave" viewBox="0 0 32 28" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <path d="M1 6q4-5 8 0t8 0t8 0t6 0M1 14q4-5 8 0t8 0t8 0t6 0M1 22q4-5 8 0t8 0t8 0t6 0" />
      </svg>
      <strong>{clearance.toFixed(1)}</strong><span>{ALTITUDE_UNIT}</span>
    </div>
    <div className="exp-phase-row" data-phase={phase}>
      <svg className="exp-phase-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        {phase === "surge"
          ? <path d="M8 1l2.5 5H11l2 4H10l1 5H7l1-5H3l2-4H4.5z" />
          : phase === "stumble"
            ? <path d="M4 5h8v2H4zm0 4h8v2H4z" />
            : <path d="M8 2a6 6 0 100 12A6 6 0 008 2zm0 2a4 4 0 110 8A4 4 0 018 4z" />}
      </svg>
      <span className="exp-phase-label">{PHASE_LABEL[phase]}</span>
      <span className="exp-track exp-phase-track"><i style={{ width: `${(1 - progress) * 100}%` }} /></span>
    </div>
  </section>;
}

type UtilitiesProps = {
  muted: boolean;
  onToggleMute: () => void;
  fullscreenSupported?: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  backControl?: ReactNode;
};

export function UtilityControls({ muted, onToggleMute, fullscreenSupported, isFullscreen = false, onToggleFullscreen, backControl }: UtilitiesProps) {
  return <div className="exp-utilities">
    {backControl}
    <button type="button" data-game-control className="exp-utility" onClick={onToggleMute}
      onContextMenu={e => e.preventDefault()} aria-pressed={muted}
      aria-label={muted ? "Unmute game sound" : "Mute game sound"} title={muted ? "Unmute game sound" : "Mute game sound"}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="M10 5 5 9H2v6h3l5 4V5Z" />
        {muted ? <path d="m15 9 6 6m0-6-6 6" /> : <path d="M14 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />}
      </svg>
    </button>
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

export function ExpeditionHud({ player, hazardY, tick, lavaPhase, lavaPhaseProgress, muted, onToggleMute, announcement, runId, topInset = 0, leftInset = 0, rightInset = 0, duel, ...utilities }: UtilitiesProps & {
  player: PlayerState | undefined; hazardY: number; tick: number;
  lavaPhase: HazardPhaseName; lavaPhaseProgress: number;
  announcement: string; runId: number; topInset?: number; leftInset?: number; rightInset?: number;
  /** Optional duel-specific data. When provided, duel instruments render below the main HUD. */
  duel?: DuelHudInfo;
}) {
  const style = { "--exp-top": `${topInset}px`, "--exp-left": `${leftInset}px`, "--exp-right": `${rightInset}px` } as CSSProperties;
  return <div className="exp-hud" style={style}>
    <HeightInstrument height={player?.y ?? 0} />
    <LavaClearanceInstrument clearance={(player?.y ?? 0) - hazardY} phase={lavaPhase} progress={lavaPhaseProgress} />
    <UtilityControls muted={muted} onToggleMute={onToggleMute} {...utilities} />
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
