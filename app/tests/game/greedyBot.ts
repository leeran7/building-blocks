/**
 * Greedy test bot shared by the sim tests: climb any ladder it is on, hop
 * crates, otherwise walk to the nearest ladder on its floor. Closed-loop on
 * the player's own state, so its input log replays deterministically.
 * Moved verbatim from simulation.test.ts so duel tests drive the same bot.
 */

import { isPowerUpActive } from "../../src/game/powerups";
import { obstacleAhead, isOnObstacle, obstaclesNearY } from "../../src/game/obstacles";
import {
  floorIndexAt,
  ladderHasShortTop,
  laddersForFloor,
  platformsForFloor,
  platformsNearY,
} from "../../src/game/towers";
import type { PlayerInput, PlayerState, TowerSpec } from "../../src/game/types";

const UP: PlayerInput = { moveX: 0, jump: false, climbY: 1, usePowerUp: false };

export function botInput(p: PlayerState, tower: TowerSpec, tick = 0): PlayerInput {
  if (p.onLadder) {
    // A short top holds the climber below the next floor: jump off it.
    if (p.ladderIx !== null && p.ladderSlot !== null && ladderHasShortTop(tower, p.ladderIx, p.ladderSlot)) {
      const l = laddersForFloor(tower, p.ladderIx)[p.ladderSlot];
      if (l && p.y >= l.y1 - 1e-6) return { ...UP, jump: !p.jumpHeldPrev };
    }
    return UP;
  }
  const canSuperJump = isPowerUpActive(p, "super-jump", tick);
  if (isOnObstacle(tower, p.x, p.y)) {
    const nextStep = obstaclesNearY(tower, p.y + 0.1, p.y + 3)
      .filter((o) => o.y1 > p.y + 0.15)
      .sort((a, b) => a.y0 - b.y0)[0];
    if (nextStep) {
      const mid = (nextStep.x0 + nextStep.x1) / 2;
      const dir: -1 | 0 | 1 = mid >= p.x ? 1 : -1;
      return {
        moveX: dir,
        jump:
          p.onGround ||
          (canSuperJump && !p.jumpHeldPrev && nextStep.y0 > p.y + 0.2),
        climbY: 0,
        usePowerUp: false,
      };
    }
  }
  const k = floorIndexAt(tower, p.y + 0.5);
  const ladders = laddersForFloor(tower, k);
  const pieces = platformsForFloor(tower, k);
  const piece = pieces.find(
    (pl) =>
      p.x >= pl.x0 - 0.15 &&
      p.x <= pl.x1 + 0.15 &&
      Math.abs(pl.y - p.y) <= 0.25
  );
  const local = piece
    ? ladders.filter((l) => l.x >= piece.x0 && l.x <= piece.x1)
    : [];
  const target = (local.length > 0 ? local : ladders)
    .slice()
    .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
  const dx = target.x - p.x;
  if (Math.abs(dx) <= tower.ladderGrabRadius * 0.5) {
    // A hanging ladder starts above the floor: jump to grab it.
    return target.y0 > p.y + 0.05 ? { ...UP, jump: p.onGround && !p.jumpHeldPrev } : UP;
  }
  const dir: -1 | 0 | 1 = dx > 0 ? 1 : -1;
  const probe = p.x + dir * 3.5;
  const probeWrapped =
    ((probe % tower.widthM) + tower.widthM) % tower.widthM;
  const probeForFloor =
    probe < 0 || probe > tower.widthM ? probeWrapped : probe;
  const ahead = platformsNearY(tower, p.y, p.y).some(
    (pl) =>
      probeForFloor >= pl.x0 &&
      probeForFloor <= pl.x1 &&
      Math.abs(pl.y - p.y) <= 0.05
  );
  const crate = obstacleAhead(tower, p.x, p.y, dir);
  return {
    moveX: dir,
    jump:
      (p.onGround && (!ahead || crate)) ||
      (!p.onGround && crate && canSuperJump && !p.jumpHeldPrev),
    climbY: 0,
    usePowerUp: false,
  };
}
