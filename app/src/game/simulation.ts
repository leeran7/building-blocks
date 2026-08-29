/**
 * Tower v3 "The Climb" — deterministic simulation core.
 *
 * This is the single source of truth for physics, run by BOTH the authoritative
 * server tick and client-side prediction (spec-next.md, Netcode). It is pure and
 * deterministic: `stepMatch(state, inputs)` is a total function of its arguments
 * (no Date.now, no Math.random — randomness comes from the seeded Rng only), so
 * re-simulating (seed, inputLog) reproduces the identical outcome. That property
 * is what AC-11 (determinism) and AC-17 (replay verification) rely on.
 *
 * The world is a Donkey-Kong-style stack of solid platforms joined by ladders,
 * with jumpable gaps. Motion is real 2D platforming — gravity, walking, jumping,
 * one-way platform landings, and ladder climbing. The pressure is Doodle-Jump
 * style: a single DEATH LINE = max(rising hazard, peak − fallDeathBelowPeak). If
 * your feet drop to it, you're out (caught = you lose; peak height is retained).
 *
 * Tick order is deliberate and load-bearing:
 *   1. advance race-clock + hazard height
 *   2. integrate each climbing player's 2D motion from their input
 *   3. FLAG FINISH is evaluated BEFORE elimination (AC-4)
 *   4. death-line elimination for players who did not finish
 *   5. resolve match end + deterministic winner (AC-2, AC-3)
 */

import {
  MatchState,
  PlayerInput,
  PlayerState,
  PlayerId,
  TowerSpec,
  Platform,
  Ladder,
  TICK_DT,
  NO_INPUT,
} from "./types";
import {
  HazardConfig,
  DEFAULT_HAZARD_CONFIG,
  hazardHeightAt,
} from "./hazard";
import {
  platformsNearY,
  laddersNearY,
  ladderForFloor,
  floorIndexAt,
  floorHeight,
} from "./towers";
import {
  DOUBLE_JUMP_CHARGES,
  DOUBLE_JUMP_MULT,
  SUPER_JUMP_MULT,
  canActivate,
  climbSpeedMultiplier,
  consumeCharge,
  cooldownTicks,
  durationTicks,
  hazardTimeScale,
  isPowerUpActive,
  moveSpeedMultiplier,
  overlapsPickup,
  powerUpForFloor,
  pruneActive,
} from "./powerups";

const EPS = 0.01;

/** Floors of power-ups kept materialized above the highest climber. */
const POWER_UP_LOOKAHEAD_FLOORS = 6;

export interface SimConfig {
  hazard: HazardConfig;
}

export const DEFAULT_SIM_CONFIG: SimConfig = {
  hazard: DEFAULT_HAZARD_CONFIG,
};

/** Build a fresh climbing player at the stack base. */
export function spawnPlayer(id: PlayerId, slot: number): PlayerState {
  return {
    id,
    slot,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    onGround: true,
    onLadder: false,
    ladderIx: null,
    status: "climbing",
    peakY: 0,
    finishedTick: null,
    activePowerUps: [],
    cooldownUntilTick: {},
    lastPickupTick: null,
    lastPickupType: null,
    jumpHeldPrev: false,
  };
}

/** Create an initial match state in the countdown phase. */
export function createMatch(params: {
  seed: string;
  mode: MatchState["mode"];
  tower: TowerSpec;
  playerIds: PlayerId[];
}): MatchState {
  const { tower } = params;
  const players = params.playerIds.map((id, i) => {
    const p = spawnPlayer(id, i);
    // Spread players across the middle of the base platform so multiplayer
    // spawns don't overlap; solo lands in the centre.
    const n = params.playerIds.length;
    p.x = n > 1 ? tower.widthM * (0.3 + 0.4 * (i / (n - 1))) : tower.widthM / 2;
    return p;
  });
  const state: MatchState = {
    seed: params.seed,
    mode: params.mode,
    phase: "countdown",
    tick: 0,
    raceSeconds: 0,
    hazardY: 0,
    hazardSlowSeconds: 0,
    tower,
    players,
    winnerId: null,
    powerUps: [],
    powerUpFloorHi: 0,
  };
  ensurePowerUps(state);
  return state;
}

/**
 * Materialize power-ups for every floor the climbers can still reach, and drop
 * the ones now sealed under the death line. The tower is endless, so orbs are
 * generated on demand from (seed, floor) exactly like platforms and ladders —
 * this only decides WHICH floors are currently in the array.
 */
function ensurePowerUps(state: MatchState): void {
  const { tower } = state;
  let topY = 0;
  for (const p of state.players) if (p.y > topY) topY = p.y;
  const hi = floorIndexAt(tower, topY) + POWER_UP_LOOKAHEAD_FLOORS;

  for (let i = state.powerUpFloorHi; i <= hi; i++) {
    const pu = powerUpForFloor(tower, i);
    if (pu) state.powerUps.push(pu);
  }
  if (hi >= state.powerUpFloorHi) state.powerUpFloorHi = hi + 1;

  // Anything on a floor fully sealed under the death line is unreachable for good.
  const belowHazard = Math.max(0, floorIndexAt(tower, state.hazardY) - 1);
  const cutoff = floorHeight(tower, belowHazard);
  if (state.powerUps.length > 0 && cutoff > 0) {
    state.powerUps = state.powerUps.filter((pu) => pu.y >= cutoff);
  }
}

// ── Geometry queries (pure) ────────────────────────────────────────────────

/** The highest platform the feet crossed from above while falling (one-way). */
function landingPlatform(
  tower: TowerSpec,
  x: number,
  prevY: number,
  newY: number
): Platform | null {
  let best: Platform | null = null;
  for (const p of platformsNearY(tower, Math.min(newY, prevY), Math.max(newY, prevY))) {
    if (x < p.x0 - EPS || x > p.x1 + EPS) continue;
    // Feet moved down through the surface: newY <= p.y <= prevY.
    if (p.y <= prevY + EPS && p.y >= newY - EPS) {
      if (!best || p.y > best.y) best = p;
    }
  }
  return best;
}

/** Is there solid ground supporting feet at (x, y)? */
function isSupported(tower: TowerSpec, x: number, y: number): boolean {
  for (const p of platformsNearY(tower, y, y)) {
    if (x < p.x0 - EPS || x > p.x1 + EPS) continue;
    if (Math.abs(p.y - y) <= EPS) return true;
  }
  return false;
}

/** A ladder (with its floor index) the player can grab in the requested direction. */
function grabbableLadder(
  tower: TowerSpec,
  x: number,
  y: number,
  climbY: number
): { ix: number; ladder: Ladder } | null {
  for (const { ix, ladder: l } of laddersNearY(tower, y, y)) {
    if (Math.abs(x - l.x) > tower.ladderGrabRadius) continue;
    if (y < l.y0 - EPS || y > l.y1 + EPS) continue;
    if (climbY > 0 && l.y1 > y + EPS) return { ix, ladder: l }; // room to climb up
    if (climbY < 0 && l.y0 < y - EPS) return { ix, ladder: l }; // room to climb down
  }
  return null;
}

// ── Motion integration ─────────────────────────────────────────────────────

/** Integrate one climbing player's 2D motion from their input for one tick. */
function integratePlayer(
  p: PlayerState,
  input: PlayerInput,
  tower: TowerSpec,
  tick: number
): void {
  const dt = TICK_DT;
  const moveSpeed = tower.moveSpeed * moveSpeedMultiplier(p, tick);
  const climbSpeed = tower.maxClimbSpeed * climbSpeedMultiplier(p, tick);

  // Horizontal movement (walk / ladder-slide is ignored while attached).
  p.vx = input.moveX * moveSpeed;

  if (p.onLadder) {
    p.x = clamp(p.x + p.vx * dt, 0, tower.widthM);
    const l = p.ladderIx !== null ? ladderForFloor(tower, p.ladderIx) : undefined;
    if (!l || input.jump) {
      // Hop off (jump) or lost the ladder reference → let go.
      p.onLadder = false;
      p.ladderIx = null;
      p.onGround = false;
      p.vy = input.jump && l ? tower.jumpSpeed * 0.7 : 0;
    } else if (Math.abs(p.x - l.x) > tower.ladderGrabRadius) {
      // Walked off the side of the ladder → let go and fall.
      p.onLadder = false;
      p.ladderIx = null;
      p.onGround = false;
      p.vy = 0;
    } else {
      p.vy = input.climbY * climbSpeed;
      p.y += p.vy * dt;
      if (p.y >= l.y1) {
        // Reached the top → step onto the platform there.
        p.y = l.y1;
        p.vy = 0;
        p.onLadder = false;
        p.ladderIx = null;
        p.onGround = true;
      } else if (p.y <= l.y0) {
        // Back down onto the lower platform.
        p.y = l.y0;
        p.vy = 0;
        p.onLadder = false;
        p.ladderIx = null;
        p.onGround = true;
      }
    }
  } else {
    p.x = clamp(p.x + p.vx * dt, 0, tower.widthM);

    // Grab a ladder if the player is asking to climb and one is in reach.
    if (input.climbY !== 0) {
      const g = grabbableLadder(tower, p.x, p.y, input.climbY);
      if (g) {
        p.onLadder = true;
        p.ladderIx = g.ix;
        p.onGround = false;
        p.vx = 0;
        p.vy = 0;
        p.x = g.ladder.x; // snap to the rungs for clean vertical climbing
        p.y = clamp(p.y, g.ladder.y0, g.ladder.y1);
      }
    }

    if (!p.onLadder) {
      // Jump. A banked super-jump charge is spent on whichever jump comes next;
      // a double-jump charge is what makes an airborne jump legal at all, and is
      // deliberately weaker than a ground launch so it reads as a recovery.
      if (input.jump && p.onGround) {
        const boosted = consumeCharge(p, "super-jump", tick);
        p.vy = tower.jumpSpeed * (boosted ? SUPER_JUMP_MULT : 1);
        p.onGround = false;
      } else if (
        input.jump &&
        !p.jumpHeldPrev &&
        !p.onGround &&
        consumeCharge(p, "double-jump", tick)
      ) {
        const boosted = consumeCharge(p, "super-jump", tick);
        p.vy = tower.jumpSpeed * DOUBLE_JUMP_MULT * (boosted ? SUPER_JUMP_MULT : 1);
      }
      // Gravity while airborne.
      if (p.onGround) {
        p.vy = 0;
      } else {
        p.vy -= tower.gravity * dt;
      }

      const prevY = p.y;
      p.y += p.vy * dt;

      if (p.y <= 0) {
        // Base floor.
        p.y = 0;
        p.vy = 0;
        p.onGround = true;
      } else if (p.vy <= 0) {
        // Falling — land on the first one-way platform crossed from above.
        const plat = landingPlatform(tower, p.x, prevY, p.y);
        if (plat) {
          p.y = plat.y;
          p.vy = 0;
          p.onGround = true;
        } else {
          p.onGround = false;
        }
      } else {
        // Rising through platforms (one-way): stay airborne.
        p.onGround = false;
      }

      // Walked off a platform edge while grounded → start falling.
      if (p.onGround && p.y > 0 && !isSupported(tower, p.x, p.y)) {
        p.onGround = false;
      }
    }
  }

  // Permanent peak-height record ethos (AC-8, AC-30/AC-31).
  if (p.y > p.peakY) p.peakY = p.y;
}

/**
 * Advance the match by exactly one tick.
 *
 * @param state  current authoritative state (mutated in place and returned)
 * @param inputs per-player input for this tick (missing = NO_INPUT / idle)
 * @param cfg    simulation tuning
 */
export function stepMatch(
  state: MatchState,
  inputs: Record<PlayerId, PlayerInput>,
  cfg: SimConfig = DEFAULT_SIM_CONFIG
): MatchState {
  // Only countdown and climb advance the sim; lobby/finished/results are inert.
  if (state.phase !== "countdown" && state.phase !== "climb") return state;

  // Countdown: a fixed 3-2-1 (90 ticks) before "GO"; inputs are locked.
  if (state.phase === "countdown") {
    state.tick += 1;
    if (state.tick >= 90) {
      state.phase = "climb";
      state.tick = 0;
      state.raceSeconds = 0;
    }
    return state;
  }

  // ── phase === "climb" ──────────────────────────────────────────────────
  state.tick += 1;
  state.raceSeconds = state.tick * TICK_DT;

  // 1. Rising hazard — speed is a fraction of the climber's climb rate, so the
  //    chase scales with how fast the player can move (AC-5, AC-6). Time-slow
  //    banks seconds the lava never gets to spend, holding the curve monotonic.
  const timeScale = hazardTimeScale(state.players, state.tick);
  state.hazardSlowSeconds += TICK_DT * (1 - timeScale);
  state.hazardY = hazardHeightAt(
    state.raceSeconds - state.hazardSlowSeconds,
    state.tower.maxClimbSpeed,
    cfg.hazard
  );

  for (const p of state.players) {
    if (p.status !== "climbing") continue;

    const input = inputs[p.id] ?? NO_INPUT;

    // 2. Integrate motion from validated input.
    integratePlayer(p, input, state.tower, state.tick);

    // 3. Auto-activate any orb the climber is now touching, on contact — no
    //    banking, no use button. An orb whose type is still cooling down (only
    //    time-slow ever sets one) is left uncollected so it stays pickable once
    //    the cooldown clears, rather than being wasted or bypassing the rule.
    for (const pu of state.powerUps) {
      if (pu.collected) continue;
      if (!overlapsPickup(pu, p.x, p.y)) continue;
      if (!canActivate(p, pu.type, state.tick)) continue;
      pu.collected = true;
      pu.collectedTick = state.tick;
      const dur = durationTicks(pu.type);
      p.activePowerUps.push({
        type: pu.type,
        startTick: state.tick,
        durationTicks: dur,
        used: false,
        chargesRemaining:
          type === "double-jump" ? DOUBLE_JUMP_CHARGES : undefined,
      });
      const cd = cooldownTicks(pu.type);
      if (cd > 0) p.cooldownUntilTick[pu.type] = state.tick + dur + cd;
      p.lastPickupTick = state.tick;
      p.lastPickupType = pu.type;
      break;
    }

    pruneActive(p, state.tick);
    p.jumpHeldPrev = input.jump;

    // 4. DEATH LINE — the higher of the rising hazard and the Doodle-Jump fall
    //    floor (peak minus the fall-death drop). The tower is endless: there is
    //    no summit, so a run ends ONLY here. Peak height (the score) is retained
    //    (AC-8).
    const fallFloor = p.peakY - state.tower.fallDeathBelowPeakM;
    const deathLine = Math.max(state.hazardY, fallFloor);
    if (p.y <= deathLine) {
      p.status = "eliminated";
      continue;
    }
  }

  // 5. Keep the reachable band of power-ups materialized.
  ensurePowerUps(state);

  // 6. Resolve match end + deterministic winner.
  resolveOutcome(state);
  return state;
}

/**
 * Decide the winner deterministically (AC-2, AC-3):
 *   - winner = first finisher by earliest finishedTick,
 *   - ties on the same tick broken by lowest slot id.
 * Match ends when someone finishes, or when nobody can still climb.
 */
function resolveOutcome(state: MatchState): void {
  const finishers = state.players
    .filter((p) => p.status === "finished" && p.finishedTick !== null)
    .sort((a, b) => {
      if (a.finishedTick !== b.finishedTick) {
        return (a.finishedTick as number) - (b.finishedTick as number);
      }
      return a.slot - b.slot; // deterministic tie-break
    });

  if (finishers.length > 0) {
    state.winnerId = finishers[0].id;
    state.phase = "finished";
    return;
  }

  // No finisher yet — if nobody can still climb, the match is over (solo caught,
  // or all multiplayer players eliminated).
  const stillClimbing = state.players.some((p) => p.status === "climbing");
  if (!stillClimbing && state.players.length > 0) {
    state.winnerId = null;
    state.phase = "finished";
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Deterministic re-simulation from a seed + ordered input log (AC-11, AC-17).
 * Feeds each tick's inputs through stepMatch and returns the final state.
 */
export function simulateFromInputs(
  init: Parameters<typeof createMatch>[0],
  inputLog: Record<PlayerId, PlayerInput>[],
  cfg: SimConfig = DEFAULT_SIM_CONFIG,
  maxTicks = 100_000
): MatchState {
  const state = createMatch(init);
  let ticks = 0;
  // Drain the countdown first (locked inputs).
  while (state.phase === "countdown" && ticks < maxTicks) {
    stepMatch(state, {}, cfg);
    ticks++;
  }
  for (const inputs of inputLog) {
    if (state.phase === "finished" || state.phase === "results") break;
    stepMatch(state, inputs, cfg);
    ticks++;
    if (ticks >= maxTicks) break;
  }
  return state;
}
