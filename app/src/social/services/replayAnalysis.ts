/**
 * Decode a Doomstack climb replay and extract the most intense moments by
 * re-running the deterministic simulation server-side.
 */

import { decodeRunReplay, MAX_REPLAY_TOKEN_LENGTH } from "../../game/runReplay";
import { buildFreeTower } from "../../game/freeStack";
import { applyRunSeed } from "../../game/towers";
import { createMatch, stepMatch } from "../../game/simulation";
import type { MatchState, PlayerInput, PowerUpType } from "../../game/types";
import { TICK_DT } from "../../game/types";

const PLAYER_ID = "you";

export interface ReplayTickSnapshot {
  tick: number;
  raceSeconds: number;
  y: number;
  peakY: number;
  hazardY: number;
  deathLine: number;
  gapM: number;
  powerUpPickup?: PowerUpType;
}

export interface ReplayHighlight {
  id: string;
  kind: "near_death" | "power_up_clutch" | "peak_milestone" | "comeback" | "final_push";
  tick: number;
  raceSeconds: number;
  peakYM: number;
  gapM: number;
  intensity: number;
  title: string;
  description: string;
}

export interface ReplayAnalysis {
  seed: string;
  reportedPeakYM: number;
  simulatedPeakYM: number;
  durationSeconds: number;
  tickCount: number;
  highlights: ReplayHighlight[];
  summary: string;
}

export function extractReplayToken(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.includes("?r=") || trimmed.includes("&r=")) {
    try {
      const url = new URL(trimmed.startsWith("http") ? trimmed : `https://doomstack.local${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`);
      const token = url.searchParams.get("r");
      if (token) return token;
    } catch {
      // fall through
    }
  }

  const playMatch = trimmed.match(/[?&]r=([^&]+)/);
  if (playMatch?.[1]) return decodeURIComponent(playMatch[1]);

  if (!trimmed.includes(" ") && trimmed.length >= 24 && trimmed.length <= MAX_REPLAY_TOKEN_LENGTH) {
    return trimmed;
  }

  return null;
}

function deathLineForPlayer(state: MatchState, peakY: number, y: number, hazardY: number): number {
  const fallFloor = peakY - state.tower.fallDeathBelowPeakM;
  return Math.max(hazardY, fallFloor);
}

function detectHighlights(snapshots: ReplayTickSnapshot[]): ReplayHighlight[] {
  const highlights: ReplayHighlight[] = [];
  let id = 0;
  let lastMilestone = 0;
  let lowestYSincePeak = snapshots[0]?.y ?? 0;
  let peakAtLow = snapshots[0]?.peakY ?? 0;

  for (let i = 0; i < snapshots.length; i++) {
    const s = snapshots[i];
    const prev = snapshots[i - 1];

    if (s.gapM < 12) {
      highlights.push({
        id: `h-${id++}`,
        kind: "near_death",
        tick: s.tick,
        raceSeconds: s.raceSeconds,
        peakYM: s.peakY,
        gapM: s.gapM,
        intensity: 90 + Math.max(0, 12 - s.gapM) * 2,
        title: "Lava on their heels",
        description: `At ${s.peakY.toFixed(0)}m with only ${s.gapM.toFixed(1)}m between the climber and the death line.`,
      });
    }

    if (s.powerUpPickup && s.gapM < 35) {
      highlights.push({
        id: `h-${id++}`,
        kind: "power_up_clutch",
        tick: s.tick,
        raceSeconds: s.raceSeconds,
        peakYM: s.peakY,
        gapM: s.gapM,
        intensity: 75,
        title: `${s.powerUpPickup} clutch pickup`,
        description: `Grabbed ${s.powerUpPickup.replace("-", " ")} at ${s.peakY.toFixed(0)}m while danger was closing in (${s.gapM.toFixed(0)}m gap).`,
      });
    }

    const milestone = Math.floor(s.peakY / 100) * 100;
    if (milestone >= 100 && milestone > lastMilestone && prev && s.peakY > prev.peakY) {
      lastMilestone = milestone;
      highlights.push({
        id: `h-${id++}`,
        kind: "peak_milestone",
        tick: s.tick,
        raceSeconds: s.raceSeconds,
        peakYM: s.peakY,
        gapM: s.gapM,
        intensity: 55 + milestone / 20,
        title: `${milestone}m milestone`,
        description: `Broke through ${milestone} metres on the endless tower.`,
      });
    }

    if (s.y < lowestYSincePeak - 15) {
      lowestYSincePeak = s.y;
      peakAtLow = s.peakY;
    }
    if (s.peakY > peakAtLow + 25 && s.y > lowestYSincePeak + 20) {
      highlights.push({
        id: `h-${id++}`,
        kind: "comeback",
        tick: s.tick,
        raceSeconds: s.raceSeconds,
        peakYM: s.peakY,
        gapM: s.gapM,
        intensity: 70,
        title: "Comeback climb",
        description: `Recovered from a drop and pushed the peak to ${s.peakY.toFixed(0)}m.`,
      });
      lowestYSincePeak = s.y;
      peakAtLow = s.peakY;
    }

    if (prev && s.peakY > prev.peakY && s.gapM < 25) {
      const climbRate = (s.y - prev.y) / TICK_DT;
      if (climbRate > 40) {
        highlights.push({
          id: `h-${id++}`,
          kind: "final_push",
          tick: s.tick,
          raceSeconds: s.raceSeconds,
          peakYM: s.peakY,
          gapM: s.gapM,
          intensity: 65,
          title: "Sprint under pressure",
          description: `Rapid vertical push to ${s.peakY.toFixed(0)}m while lava chased at ${s.gapM.toFixed(0)}m gap.`,
        });
      }
    }
  }

  const last = snapshots[snapshots.length - 1];
  if (last) {
    highlights.push({
      id: `h-${id++}`,
      kind: "final_push",
      tick: last.tick,
      raceSeconds: last.raceSeconds,
      peakYM: last.peakY,
      gapM: last.gapM,
      intensity: 60,
      title: "Run-ending peak",
      description: `The run topped out at ${last.peakY.toFixed(1)}m before the climber was caught.`,
    });
  }

  const deduped = dedupeHighlights(highlights);
  return deduped.sort((a, b) => b.intensity - a.intensity).slice(0, 6);
}

function dedupeHighlights(highlights: ReplayHighlight[]): ReplayHighlight[] {
  const kept: ReplayHighlight[] = [];
  for (const h of highlights.sort((a, b) => b.intensity - a.intensity)) {
    const tooClose = kept.some(
      (k) => k.kind === h.kind && Math.abs(k.tick - h.tick) < 90
    );
    if (!tooClose) kept.push(h);
  }
  return kept;
}

export function buildReplaySummary(analysis: Omit<ReplayAnalysis, "summary">): string {
  const top = analysis.highlights.slice(0, 3);
  const lines = [
    `Climb replay: ${analysis.simulatedPeakYM.toFixed(1)}m peak over ${analysis.durationSeconds.toFixed(0)}s.`,
    top.length
      ? `Top moments: ${top.map((h) => h.title).join("; ")}.`
      : "Steady climb with no extreme danger spikes detected.",
  ];
  return lines.join(" ");
}

export async function analyzeClimbReplay(replayInput: string): Promise<ReplayAnalysis> {
  const token = extractReplayToken(replayInput);
  if (!token) throw new Error("Invalid replay link or token");

  const replay = await decodeRunReplay(token);
  if (!replay) throw new Error("Could not decode replay — link may be corrupt or expired");

  const tower = applyRunSeed(buildFreeTower(), replay.seed);
  const state = createMatch({
    seed: replay.seed,
    mode: "solo",
    tower,
    playerIds: [PLAYER_ID],
  });

  const snapshots: ReplayTickSnapshot[] = [];
  let prevPickupTick = -1;

  while (state.phase === "countdown") {
    stepMatch(state, {}, undefined);
  }

  for (const input of replay.inputs) {
    if (state.phase !== "climb" && state.players[0].status === "eliminated") break;
    const prevPickup = state.players[0].lastPickupTick;
    stepMatch(state, { [PLAYER_ID]: input }, undefined);
    const p = state.players[0];

    const deathLine = deathLineForPlayer(state, p.peakY, p.y, state.hazardY);
    let powerUpPickup: PowerUpType | undefined;
    if (p.lastPickupTick != null && p.lastPickupTick !== prevPickupTick && p.lastPickupType) {
      powerUpPickup = p.lastPickupType;
      prevPickupTick = p.lastPickupTick;
    }

    if (state.phase === "climb" || p.status === "eliminated") {
      snapshots.push({
        tick: state.tick,
        raceSeconds: state.raceSeconds,
        y: p.y,
        peakY: p.peakY,
        hazardY: state.hazardY,
        deathLine,
        gapM: p.y - deathLine,
        powerUpPickup,
      });
    }
    if (p.status === "eliminated") break;
  }

  const simulatedPeakYM = state.players[0].peakY;
  const highlights = detectHighlights(snapshots);
  const durationSeconds = snapshots[snapshots.length - 1]?.raceSeconds ?? 0;

  const base = {
    seed: replay.seed,
    reportedPeakYM: replay.peakY,
    simulatedPeakYM,
    durationSeconds,
    tickCount: replay.inputs.length,
    highlights,
  };

  return { ...base, summary: buildReplaySummary(base) };
}

export function highlightToVideoScene(h: ReplayHighlight): string {
  return [
    `Vertical 9:16 social clip for Doomstack "The Climb".`,
    h.title + ":",
    h.description,
    `Peak height ${h.peakYM.toFixed(0)}m, lava rising from below, indie pixel-art tower aesthetic, hype energy.`,
  ].join(" ");
}

export function topHighlightsVideoPrompt(highlights: ReplayHighlight[]): string {
  const top = highlights.slice(0, 2);
  if (top.length === 0) {
    return "Vertical 9:16 hype clip of an endless tower climb in Doomstack, lava rising, pixel-art indie game aesthetic.";
  }
  return top.map(highlightToVideoScene).join("\n\n");
}
