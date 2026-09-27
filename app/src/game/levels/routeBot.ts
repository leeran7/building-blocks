/**
 * Route bot for level generation (design doc §3, winnability gate item 1).
 *
 * Same moves as the greedy test bot (tests/game/greedyBot.ts): climb any
 * ladder it is on, walk up crate stairs, otherwise walk to a ladder on its
 * floor and jump gaps and crates on the way. Two changes make it finish long
 * level towers instead of looping:
 *
 * - it commits to one target ladder per floor, so a jump across a gap never
 *   flips direction mid-air when the "nearest ladder" changes under it
 *   (the greedy bot fell into gaps that way and climbed back forever);
 * - it keeps its walk direction while airborne.
 *
 * It is stateful (the committed target), so build one per run with
 * `createRouteBot()`. It reads only the player and tower, never the lava, so
 * one bot's route is the same under any lava config until the lava catches it.
 * It never uses power-ups on purpose: orbs it walks through still activate
 * (auto-activation), which the generator treats as part of that seed's route.
 */

import { isPowerUpActive, moveSpeedMultiplier } from "../powerups";
import { obstacleAhead, isOnObstacle, obstaclesNearY } from "../obstacles";
import {
  floorIndexAt,
  laddersForFloor,
  platformsForFloor,
  platformsNearY,
} from "../towers";
import type { Ladder, PlayerInput, PlayerState, TowerSpec } from "../types";

const UP: PlayerInput = { moveX: 0, jump: false, climbY: 1, usePowerUp: false };

export type RouteBot = (p: PlayerState, tower: TowerSpec, tick: number) => PlayerInput;

export function createRouteBot(): RouteBot {
  let targetFloor = -1;
  let target: Ladder | null = null;
  let dir: -1 | 1 = 1;
  let gapJump = false;

  return (p, tower, tick) => {
    if (p.onGround || p.onLadder) gapJump = false;
    if (p.onLadder) return UP;
    const canSuperJump = isPowerUpActive(p, "super-jump", tick);

    if (isOnObstacle(tower, p.x, p.y)) {
      const nextStep = obstaclesNearY(tower, p.y + 0.1, p.y + 3)
        .filter((o) => o.y1 > p.y + 0.15)
        .sort((a, b) => a.y0 - b.y0)[0];
      if (nextStep) {
        const mid = (nextStep.x0 + nextStep.x1) / 2;
        dir = mid >= p.x ? 1 : -1;
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

    // Airborne: steer the landing. Hold the direction (re-targeting mid-jump
    // dropped the greedy bot into gaps), but stop over a platform piece when
    // carrying on would land in a gap, so a narrow island between two gaps
    // becomes a stepping stone instead of a fall.
    if (!p.onGround) {
      const steer = airSteer(tower, p, dir, tick);
      if (gapJump || steer === 0) {
        return { moveX: steer, jump: false, climbY: 0, usePowerUp: false };
      }
    }

    const k = floorIndexAt(tower, p.y + 0.5);
    if (p.onGround && (k !== targetFloor || target === null)) {
      targetFloor = k;
      target = pickTarget(tower, k, p);
    }
    if (target === null) target = pickTarget(tower, k, p);
    const dx = target.x - p.x;
    if (Math.abs(dx) <= tower.ladderGrabRadius * 0.5) return UP;
    dir = dx > 0 ? 1 : -1;
    const probe = p.x + dir * 3.5;
    const probeWrapped = ((probe % tower.widthM) + tower.widthM) % tower.widthM;
    const probeForFloor = probe < 0 || probe > tower.widthM ? probeWrapped : probe;
    const ahead = platformsNearY(tower, p.y, p.y).some(
      (pl) =>
        probeForFloor >= pl.x0 &&
        probeForFloor <= pl.x1 &&
        Math.abs(pl.y - p.y) <= 0.05
    );
    const crate = obstacleAhead(tower, p.x, p.y, dir);
    if (p.onGround && !ahead) gapJump = true;
    return {
      moveX: dir,
      jump:
        (p.onGround && (!ahead || crate)) ||
        (!p.onGround && crate && canSuperJump && !p.jumpHeldPrev),
      climbY: 0,
      usePowerUp: false,
    };
  };
}

/**
 * Horizontal input for an airborne climber heading `dir`: keep going if the
 * projected landing is on a platform of this floor, otherwise stop while over
 * a piece so the climber drops onto it.
 */
function airSteer(tower: TowerSpec, p: PlayerState, dir: -1 | 1, tick: number): -1 | 0 | 1 {
  const k = floorIndexAt(tower, p.y + 0.5);
  const pieces = platformsForFloor(tower, k);
  if (pieces.length === 0) return dir;
  const floorY = pieces[0].y;
  const drop = Math.max(0, p.y - floorY);
  const g = tower.gravity;
  const tLand = (p.vy + Math.sqrt(p.vy * p.vy + 2 * g * drop)) / g;
  const speed = tower.moveSpeed * moveSpeedMultiplier(p, tick);
  const w = tower.widthM;
  const landX = (((p.x + dir * speed * tLand) % w) + w) % w;
  const MARGIN = 0.4;
  const onPiece = (x: number) =>
    pieces.some((pl) => x >= pl.x0 + MARGIN && x <= pl.x1 - MARGIN);
  if (onPiece(landX)) return dir;
  return onPiece(p.x) ? 0 : dir;
}

/** Nearest ladder on the platform piece the bot stands on, else on the floor. */
function pickTarget(tower: TowerSpec, k: number, p: PlayerState): Ladder {
  const ladders = laddersForFloor(tower, k);
  const piece = platformsForFloor(tower, k).find(
    (pl) =>
      p.x >= pl.x0 - 0.15 &&
      p.x <= pl.x1 + 0.15 &&
      Math.abs(pl.y - p.y) <= 0.25
  );
  const local = piece
    ? ladders.filter((l) => l.x >= piece.x0 && l.x <= piece.x1)
    : [];
  return (local.length > 0 ? local : ladders)
    .slice()
    .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
}
