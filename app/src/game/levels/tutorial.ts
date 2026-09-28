/**
 * Level tutorials: short demos played by the real engine before a level.
 *
 * Each demo is a scripted climber on a small demo tower, stepped through the
 * same `stepMatch` a level uses, so what the player watches is exactly how
 * the game moves. The mobile app renders it with the game's own canvas.
 *
 * - "basics" plays before level 1: walk off one side of the tower and come
 *   back on the other, then climb ladders.
 * - Each power-up type has its own demo, played before the level that
 *   introduces it (`tower.introPowerUp`): walk into the orb, then use it.
 *
 * Demos are pure and deterministic (fixed seeds, no lava randomness), so
 * tests can prove every demo shows what its caption says.
 */

import { DEFAULT_HAZARD_CONFIG, type HazardConfig } from "../hazard";
import { obstacleAhead } from "../obstacles";
import { CONCRETE_POWER_UP_TYPES, GIANT_VISUAL_SCALE, POWER_UP_SPECS } from "../powerups";
import { createMatch, stepMatch, type SimConfig } from "../simulation";
import { applyRunSeed, floorHeight, laddersForFloor } from "../towers";
import { buildFreeTower } from "../freeStack";
import { TICK_HZ, type MatchState, type PlayerInput, type PowerUpType, type TowerSpec } from "../types";
import { createRouteBot } from "./routeBot";
import { NO_LAVA } from "./levelRun";

export type TutorialTopic = "basics" | PowerUpType;

export interface TutorialStep {
  /** Short heading, e.g. "Cross sides". */
  title: string;
  /** One sentence of how to do it. */
  body: string;
}

export interface TutorialInfo {
  topic: TutorialTopic;
  /** Card heading, e.g. "How to climb" or "New power-up: Jetpack". */
  heading: string;
  steps: readonly TutorialStep[];
}

/** One running demo: step it at TICK_HZ and paint `state`. */
export interface TutorialDemo {
  readonly info: TutorialInfo;
  readonly state: MatchState;
  readonly cfg: SimConfig;
  /** Index into `info.steps` of the caption to show now. */
  readonly stepIndex: number;
  /** The demo has shown everything; the player can replay or move on. */
  readonly done: boolean;
  /** Advance one tick. A no-op once done. */
  step(): void;
}

const DEMO_ID = "demo";

/** Longest a demo runs, whatever happens. */
export const MAX_DEMO_TICKS = 16 * TICK_HZ;
/** Keep showing the last step this long before the demo counts as done. */
const HOLD_TICKS = TICK_HZ;
/** How long the climber uses a power-up before the demo ends. */
const USE_TICKS = 5 * TICK_HZ;
/** Where a power-up demo puts its orb: this far from spawn toward the nearest ladder, on floor 0. */
const ORB_OFFSET_M = 7;
const ORB_HOVER_M = 3;
/** Lava demos stand still this long first, so the lava is seen rising. */
const LAVA_WAIT_TICKS = TICK_HZ;

const IDLE: PlayerInput = { moveX: 0, jump: false, climbY: 0, usePowerUp: false };

const BASICS: TutorialInfo = {
  topic: "basics",
  heading: "How to climb",
  steps: [
    {
      title: "Cross sides",
      body: "The tower wraps around. Walk off one edge and you come back on the other side.",
    },
    {
      title: "Climb ladders",
      body: "Stop at a ladder and hold ↑ to climb. Ladders are the fastest way up.",
    },
  ],
};

/** The caption copy for a topic. */
export function tutorialInfo(topic: TutorialTopic): TutorialInfo {
  if (topic === "basics") return BASICS;
  const spec = POWER_UP_SPECS[topic];
  return {
    topic,
    heading: `New power-up: ${spec.label}`,
    steps: [
      {
        title: "Grab the orb",
        body: "Walk into a glowing orb. Its power-up starts the moment you touch it.",
      },
      { title: spec.label, body: powerUpHint(topic) },
    ],
  };
}

function powerUpHint(type: PowerUpType): string {
  const spec = POWER_UP_SPECS[type];
  switch (type) {
    case "super-jump":
      return "Jump much higher, and tap jump again in the air for extra jumps.";
    case "jetpack":
      return "Jump, then hold jump in the air to fly. Watch the fuel.";
    case "giant":
      return `Grow to ${GIANT_VISUAL_SCALE}× size: stride over small crates and grab ladders from further away.`;
    case "harden-lava":
      return "The lava turns to rock and stops rising for a while.";
    case "random":
      return "It turns into one of the power-ups you have already met.";
    default:
      // Durations vary by level, so the level start card gives them.
      return `${spec.description} for a short time.`;
  }
}

/**
 * The demos to play before a level, in order: the basics before level 1, and
 * the power-up a level introduces. Levels with nothing new get none.
 */
export function tutorialTopicsFor(level: number, introPowerUp: PowerUpType | null): TutorialTopic[] {
  const topics: TutorialTopic[] = [];
  if (level === 1) topics.push("basics");
  if (introPowerUp !== null) topics.push(introPowerUp);
  return topics;
}

/**
 * The demo tower: the free tower's physics on a fixed seed, with the easiest
 * layout.
 */
export function tutorialTower(topic: TutorialTopic): TowerSpec {
  const allowed: PowerUpType[] =
    topic === "basics" ? [] : topic === "random" ? ["random", ...CONCRETE_POWER_UP_TYPES] : [topic];
  // allowedPowerUps is what a random orb rolls among; createTutorialDemo
  // switches off the tower's own spawns.
  return {
    ...applyRunSeed(buildFreeTower(), `tutorial:${topic}`),
    difficulty: 0,
    powerUpChance: 0,
    allowedPowerUps: allowed,
  };
}

/**
 * Lava for the lava power-ups: close and rising from GO, so the slow-down or
 * the rock is plain to see. Every other demo has none.
 */
const LAVA_DEMO_HAZARD: HazardConfig = {
  ...DEFAULT_HAZARD_CONFIG,
  headStartM: 8,
  graceSeconds: 0,
  startSpeedFrac: 0.25,
  endSpeedFrac: 0.25,
  creepPerMinute: 0,
  stumbleSpeedFrac: 1,
};

function isLavaTopic(topic: TutorialTopic): boolean {
  return topic === "slow-lava" || topic === "harden-lava";
}

export function createTutorialDemo(topic: TutorialTopic): TutorialDemo {
  const info = tutorialInfo(topic);
  const tower = tutorialTower(topic);
  const cfg: SimConfig = { hazard: isLavaTopic(topic) ? LAVA_DEMO_HAZARD : NO_LAVA };
  const state = createMatch({ seed: tower.seed, mode: "solo", tower, playerIds: [DEMO_ID] });
  // Skip the 3-2-1: the demo starts on the move.
  while (state.phase === "countdown") stepMatch(state, {}, cfg);

  // The demo shows only the orb it places: switch off the tower's own spawns
  // (ensurePowerUps generates nothing below powerUpFloorHi's window).
  state.powerUps = [];
  state.powerUpFloorHi = Number.MAX_SAFE_INTEGER;
  // Power-up demos walk toward the nearest ladder, so the climb after the
  // grab starts soon.
  const spawnX = state.players[0].x;
  const nearest = laddersForFloor(tower, 0)
    .slice()
    .sort((a, b) => Math.abs(a.x - spawnX) - Math.abs(b.x - spawnX))[0];
  const toward: -1 | 1 = nearest && nearest.x < spawnX ? -1 : 1;
  if (topic !== "basics") {
    state.powerUps.push({
      id: "pu:tutorial",
      type: topic,
      floorIndex: 0,
      x: spawnX + toward * ORB_OFFSET_M,
      y: floorHeight(tower, 0) + ORB_HOVER_M,
      collected: false,
      collectedTick: null,
    });
  }

  const director = topic === "basics" ? basicsDirector(state) : powerUpDirector(topic, toward, isLavaTopic(topic) ? LAVA_WAIT_TICKS : 0);
  let stepIndex = 0;
  // Counted here, not from state.tick, which stops once the match ends.
  let ticks = 0;
  let doneAt: number | null = null;
  let done = false;

  return {
    info,
    state,
    cfg,
    get stepIndex() {
      return stepIndex;
    },
    get done() {
      return done;
    },
    step() {
      if (done) return;
      const d = director(state);
      stepIndex = Math.max(stepIndex, d.stepIndex);
      stepMatch(state, { [DEMO_ID]: d.input }, cfg);
      ticks += 1;
      const over = state.phase !== "climb" || state.players[0].status !== "climbing";
      if (doneAt === null && (d.finished || over)) doneAt = ticks;
      if ((doneAt !== null && ticks - doneAt >= HOLD_TICKS) || ticks >= MAX_DEMO_TICKS) done = true;
    },
  };
}

interface Direction {
  input: PlayerInput;
  stepIndex: number;
  /** Everything has been shown; hold the last caption, then end. */
  finished: boolean;
}

type Director = (state: MatchState) => Direction;

/**
 * Basics: walk right until the climber wraps past the tower's edge, then
 * climb with the route bot until two floors up.
 */
function basicsDirector(start: MatchState): Director {
  const bot = createRouteBot();
  const widthM = start.tower.widthM;
  let lastX = start.players[0].x;
  let wrappedAt: number | null = null;
  const goalY = floorHeight(start.tower, 2);
  return (state) => {
    const p = state.players[0];
    // A jump of more than half the width in one tick is the wrap.
    if (wrappedAt === null && Math.abs(p.x - lastX) > widthM / 2) wrappedAt = state.tick;
    lastX = p.x;
    const walking = wrappedAt === null || state.tick - wrappedAt < TICK_HZ / 2;
    if (walking) {
      const crate = p.onGround && obstacleAhead(state.tower, p.x, p.y, 1);
      return { input: { moveX: 1, jump: crate, climbY: 0, usePowerUp: false }, stepIndex: 0, finished: false };
    }
    return {
      input: bot(p, state.tower, state.tick),
      stepIndex: p.onLadder ? 1 : 0,
      finished: p.y >= goalY,
    };
  };
}

/**
 * Power-ups: walk into the orb (after a pause on the lava demos), then use it the way its caption says
 * for a few seconds.
 */
function powerUpDirector(type: PowerUpType, toward: -1 | 1, waitTicks: number): Director {
  const bot = createRouteBot();
  let pickedAt: number | null = null;
  return (state) => {
    const p = state.players[0];
    if (pickedAt === null && p.lastPickupTick !== null) pickedAt = state.tick;
    if (pickedAt === null) {
      const moveX = state.tick < waitTicks ? 0 : toward;
      return { input: { moveX, jump: false, climbY: 0, usePowerUp: false }, stepIndex: 0, finished: false };
    }
    const since = state.tick - pickedAt;
    return { input: useInput(type, state, since, bot), stepIndex: 1, finished: since >= USE_TICKS };
  };
}

function useInput(
  type: PowerUpType,
  state: MatchState,
  since: number,
  bot: ReturnType<typeof createRouteBot>,
): PlayerInput {
  const p = state.players[0];
  // A random orb has already turned into a concrete type: use that one.
  const effective = type === "random" ? (p.lastPickupType ?? type) : type;
  switch (effective) {
    case "super-jump":
      // Straight up: a launch, then an air jump at each apex while charges last.
      if (p.jumpHeldPrev) return IDLE;
      return p.onGround || p.vy <= 0 ? { ...IDLE, jump: true } : IDLE;
    case "jetpack":
      // Tap to leave the ground, let go, then hold to thrust.
      if (since < 2) return { ...IDLE, jump: since === 0 };
      return { ...IDLE, jump: true };
    default:
      return bot(p, state.tower, state.tick);
  }
}
