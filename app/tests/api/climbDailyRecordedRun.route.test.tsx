/**
 * A daily run RECORDED by the real client recorder round-trips through the
 * real POST /api/climb/daily/result to the same peak.
 *
 * tests/game/dailyVerify.test.ts builds its runs with a hand-written loop that
 * mirrors useClimb. That proves the verifier, but not that the client and the
 * server build the same match: if useClimb used another player id, tower or
 * sim config, or logged countdown ticks, every honest phone run would fail
 * with REPLAY_MISMATCH while those tests stayed green. Here the real useClimb
 * hook (the one mobile ClimbScreen and web ClimbScene use) plays today's
 * tower from scripted touch input on a manual rAF clock; its own inputLog is
 * encoded with the real encoder and POSTed to the real route. Only auth, the
 * rate limiter and the DB writes are mocked.
 *
 * @vitest-environment happy-dom
 */

import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, degraded: false })),
  clientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("../../src/lib/firebaseAdmin", () => ({
  verifyIdToken: vi.fn(async () => ({ uid: "u1", email: "u1@example.com", email_verified: true })),
}));
vi.mock("../../src/db/user", () => ({ ensureUser: vi.fn() }));
vi.mock("../../src/db/client", () => ({
  prisma: { user: { findUnique: vi.fn(async () => ({ leaderboard_consent_at: new Date() })) } },
}));
vi.mock("../../src/db/climb", () => ({
  recordClimb: vi.fn(async () => ({ peakY: 0, improved: false, rank: 1, totalClimbers: 1, handle: "h" })),
}));
vi.mock("../../src/db/dailyClimb", () => ({
  dailyLeaderboardTag: (day: string) => `daily-leaderboard:${day}`,
  recordDailyClimb: vi.fn(async (input: { peakY: number }) => ({ peakY: input.peakY, improved: true, attempts: 1 })),
  dailyStandingFor: vi.fn(async () => ({ rank: 1, peakY: 0, attempts: 1 })),
  dailyClimberCount: vi.fn(async () => 1),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { POST } from "../../app/api/climb/daily/result/route";
import { recordDailyClimb } from "../../src/db/dailyClimb";
import { useClimb, type UseClimbResult } from "../../src/game/useClimb";
import { buildFreeTower } from "../../src/game/freeStack";
import { encodeRunReplay } from "../../src/game/runReplay";
import { resimulateSoloRun } from "../../src/game/dailyVerify";
import { dailySeedFor } from "../../src/lib/dailyDay";

const DAY = "2026-09-26";
const SEED = dailySeedFor(DAY);
const FRAME_MS = 34; // a little over one 30 Hz tick, so every frame steps >= 1 tick
const MAX_FRAMES = 4000;

let rafQueue: FrameRequestCallback[] = [];
let root: Root | null = null;
let container: HTMLElement | null = null;

function flushFrame(ts: number) {
  const cbs = rafQueue;
  rafQueue = [];
  for (const cb of cbs) cb(ts);
}

/** Mounts a probe that exposes the real hook's result to the test. */
async function mountRecorder(): Promise<{ current: UseClimbResult }> {
  const box = { current: null as unknown as UseClimbResult };
  const tower = buildFreeTower();
  function Probe() {
    box.current = useClimb({ tower, seed: SEED });
    return null;
  }
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container!);
    root.render(createElement(Probe));
  });
  return box;
}

/**
 * Plays with the same scripted policy as tests/game/dailyVerify.test.ts, fed
 * through setTouch the way TouchControls feeds it, and returns what the
 * client would submit: its own inputLog and its own peak.
 */
async function recordRun(hook: { current: UseClimbResult }) {
  await act(async () => hook.current.start());
  let ts = 1000;
  let r = 28;
  let lastBlock = -1;
  let moveX: -1 | 0 | 1 = 1;
  for (let f = 0; f < MAX_FRAMES; f++) {
    const sim = hook.current.simRef.current;
    if (sim.phase === "finished" || sim.phase === "results") break;
    const tick = sim.phase === "climb" ? sim.tick : 0;
    const block = Math.floor(tick / 10);
    if (sim.phase === "climb" && block !== lastBlock) {
      lastBlock = block;
      r = (r * 16807) % 2147483647;
      moveX = ((r % 3) - 1) as -1 | 0 | 1;
    }
    hook.current.setTouch({
      left: moveX === -1,
      right: moveX === 1,
      up: true,
      down: false,
      jump: sim.phase === "climb" && tick % 23 === 0,
    });
    await act(async () => flushFrame(ts));
    ts += FRAME_MS;
  }
  // Let the finished-phase effect publish inputLog.
  await act(async () => {});
  const sim = hook.current.simRef.current;
  return { inputs: hook.current.inputLog, peakY: sim.players[0].peakY, phase: sim.phase };
}

describe("recorded daily run -> POST /api/climb/daily/result", () => {
  beforeEach(() => {
    rafQueue = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.useFakeTimers({ now: new Date("2026-09-26T12:00:00Z"), toFake: ["Date"] });
    vi.mocked(recordDailyClimb).mockClear();
  });
  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("stores exactly the peak the client saw, from the client's own input log", async () => {
    const hook = await mountRecorder();
    const run = await recordRun(hook);

    expect(run.phase === "finished" || run.phase === "results").toBe(true);
    expect(run.inputs.length).toBeGreaterThan(0);
    // The run must climb past the first ledge (~2.6 m on any tower), or a
    // wrong tower would reproduce it by coincidence.
    expect(run.peakY).toBeGreaterThan(4);
    const otherTower = resimulateSoloRun(dailySeedFor("2026-09-25"), run.inputs).player.peakY;
    expect(Math.abs(otherTower - run.peakY)).toBeGreaterThan(1);

    const replayToken = await encodeRunReplay({ seed: SEED, peakY: run.peakY, inputs: run.inputs });
    expect(replayToken).toBeTruthy();
    const res = await POST(
      new NextRequest("http://localhost/api/climb/daily/result", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer good" },
        body: JSON.stringify({ replayToken, peakY: run.peakY, seed: SEED }),
      })
    );
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status, JSON.stringify(json)).toBe(200);
    expect(json).toMatchObject({ saved: true, day: DAY, peakY: run.peakY });
    expect(vi.mocked(recordDailyClimb).mock.calls[0][0]).toMatchObject({
      day: DAY,
      peakY: run.peakY,
      ticks: run.inputs.length,
    });
  });
});
