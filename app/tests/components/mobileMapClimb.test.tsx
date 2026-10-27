/**
 * The level map's climb: back on the map after clearing floors, the player's
 * character walks to each ladder, climbs it and steps onto the next floor, one
 * floor per level cleared since the map last showed them.
 *
 * The path tests call the real functions the climber moves by (mapClimb.ts)
 * against the tower's own geometry; the render tests mount the real
 * LevelMapScreen on the device-local level store. Only auth, haptics, the
 * network, the lava painter and the character painters are mocked, and
 * animation frames run on a fake clock.
 *
 * @vitest-environment happy-dom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const haptics = vi.hoisted(() => ({ light: 0 }));

vi.mock("../../mobile/src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "me" }, isAnonymous: false, loading: false, signOut: vi.fn(async () => {}) }),
}));
vi.mock("../../mobile/src/lib/haptics", () => ({
  tapLight: vi.fn(async () => {
    haptics.light++;
  }),
  tapMedium: vi.fn(async () => {}),
  tapHeavy: vi.fn(async () => {}),
  notifySuccess: vi.fn(async () => {}),
  notifyError: vi.fn(async () => {}),
}));
vi.mock("@app/components/Game/lava", () => ({ drawLava: vi.fn(), isLavaInProximity: () => false }));
vi.mock("../../mobile/src/lib/api", () => ({
  apiFetch: vi.fn(async () => ({ ok: true, status: 200, json: () => Promise.resolve({}) }) as Response),
  SITE_ORIGIN: "https://example.test",
}));
vi.mock("@app/components/Game/paintClimbFrame", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/components/Game/paintClimbFrame")>();
  return { ...real, drawClimber: () => {} };
});
vi.mock("@app/components/Game/climberSprite", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/components/Game/climberSprite")>();
  return { ...real, drawClimberSprite: () => true };
});

import { LevelsProvider } from "../../mobile/src/contexts/LevelsContext";
import { createMockLevelsClient } from "../../mobile/src/lib/levels/mockClient";
import { EPISODE_SIZE, type LevelsClient } from "../../mobile/src/lib/levels/model";
import { createSeenFloorStore, parseSeenFloor } from "../../mobile/src/lib/levels/seenFloor";
import { LevelMapScreen } from "../../mobile/src/screens/LevelMapScreen";
import { FIGURE_PX, ladderX, pinX, slabTop, slabUnderside } from "../../mobile/src/components/levels/towerGeometry";
import {
  CLIMB_LEAD_IN_S,
  MAX_CLIMB_FLOORS,
  MAX_CLIMB_S,
  THROUGH_SPEEDUP,
  climbDuration,
  climbFrameAt,
  climbFrom,
  climbPath,
} from "../../mobile/src/components/levels/mapClimb";
import { TICK_HZ } from "../../src/game/types";
import { POWER_UP_TYPES } from "../../src/game/powerups";
import { markTutorialsSeen } from "../../mobile/src/lib/levels/tutorialSeen";

describe("climb path", () => {
  it("climbs only when the frontier is above the floor last seen, at most MAX_CLIMB_FLOORS", () => {
    expect(climbFrom(null, 8)).toBeNull();
    expect(climbFrom(8, 8)).toBeNull();
    expect(climbFrom(9, 8)).toBeNull();
    expect(climbFrom(1, 8)).toBe(1);
    expect(climbFrom(1, 1 + MAX_CLIMB_FLOORS)).toBe(1);
    expect(climbFrom(1, 2 + MAX_CLIMB_FLOORS)).toBe(2);
  });

  it("walks to each ladder, climbs it and steps onto the next floor, landing on every floor once", () => {
    const path = climbPath(1, 8);
    expect(path[0]).toMatchObject({ x0: pinX(1), y0: slabTop(1) });
    expect(path[path.length - 1]).toMatchObject({ x1: pinX(8), y1: slabTop(8) });
    expect(path.map((s) => s.lands).filter((n) => n !== null)).toEqual([2, 3, 4, 5, 6, 7, 8]);

    // Each ladder is two climb segments: up to where the head meets the slab above, then quicker through it.
    const climbs = path.filter((s) => s.pose === "climb");
    expect(climbs.length).toBe(14);
    expect(THROUGH_SPEEDUP).toBeGreaterThan(1);
    for (let i = 0; i < 7; i++) {
      const [up, through] = [climbs[2 * i], climbs[2 * i + 1]];
      expect([up.x0, up.x1, through.x0, through.x1]).toEqual(Array(4).fill(ladderX(1 + i)));
      expect(up.y0).toBe(slabTop(1 + i));
      expect(up.y1).toBe(slabUnderside(2 + i) - FIGURE_PX);
      expect(through.y1).toBe(slabTop(2 + i));
      const pace = (s: typeof up) => (s.y1 - s.y0) / s.seconds;
      expect(pace(through) / pace(up)).toBeCloseTo(THROUGH_SPEEDUP, 6);
    }
    // Walks stay on a floor, and each segment starts where the last one ended.
    expect(path.filter((s) => s.pose === "walk").every((s) => s.y0 === s.y1)).toBe(true);
    for (let i = 1; i < path.length; i++) {
      expect(path[i].x0).toBeCloseTo(path[i - 1].x1, 9);
      expect(path[i].y0).toBeCloseTo(path[i - 1].y1, 9);
      expect(path[i].at).toBeCloseTo(path[i - 1].at + path[i - 1].seconds, 9);
    }
  });

  it("never turns back on a floor it passes through: it walks straight from ladder to ladder", () => {
    let checked = 0;
    for (const [from, to] of [[1, 8], [2, 9], [3, 15], [EPISODE_SIZE - 3, EPISODE_SIZE + 4]]) {
      const path = climbPath(from, to);
      for (let n = from + 1; n < to; n++) {
        // On a floor passed through, at most one walk, from the ladder below to the ladder above.
        const walks = path.filter((s) => s.pose === "walk" && s.y0 === slabTop(n));
        expect(walks.length, `floor ${n}`).toBeLessThanOrEqual(1);
        for (const w of walks) {
          expect(w.x0).toBe(ladderX(n - 1));
          expect(w.x1).toBe(ladderX(n));
        }
        checked++;
      }
      // The whole route moves across the map at most once per floor, and only the end goes to a slab's middle.
      const middles = path.filter((s) => s.pose === "walk" && s.x1 === pinX(to) && s.y0 === slabTop(to));
      expect(middles.length).toBeLessThanOrEqual(1);
    }
    expect(checked).toBeGreaterThan(0);
    // Floors 2 and 3 share a ladder spot: climbing 2 -> 4 goes straight up with no walk on floor 3.
    expect(ladderX(2)).toBe(ladderX(3));
    expect(climbPath(2, 4).filter((s) => s.pose === "walk" && s.y0 === slabTop(3))).toEqual([]);
  });

  it("climbs through an episode landing in one go", () => {
    const path = climbPath(EPISODE_SIZE, EPISODE_SIZE + 1);
    const climbs = path.filter((s) => s.pose === "climb");
    expect(climbs.length).toBe(2);
    expect(climbs[1].y1 - climbs[0].y0).toBeGreaterThan(slabTop(3) - slabTop(2));
    expect(path.filter((s) => s.lands !== null).map((s) => s.lands)).toEqual([EPISODE_SIZE + 1]);
  });

  it("fits a long climb into MAX_CLIMB_S, and leaves a short one at walking pace", () => {
    // Past the floor cap a path still fits (climbPath itself takes any span).
    expect(climbDuration(climbPath(1, 1 + 4 * MAX_CLIMB_FLOORS))).toBeCloseTo(MAX_CLIMB_S, 9);
    expect(climbDuration(climbPath(1, 1 + MAX_CLIMB_FLOORS))).toBeLessThanOrEqual(MAX_CLIMB_S);
    const short = climbDuration(climbPath(1, 2));
    expect(short).toBeGreaterThan(0.3);
    expect(short).toBeLessThan(MAX_CLIMB_S / 4);
  });

  it("reports the pose, the facing and the floors reached as time passes", () => {
    const path = climbPath(3, 5);
    expect(climbFrameAt(path, -1)).toMatchObject({ x: pinX(3), y: slabTop(3), pose: "idle", landed: null });
    // Floor 3 is the right-hand stop, so its ladder up is to the left: it walks left first.
    expect(ladderX(3)).toBeLessThan(pinX(3));
    expect(climbFrameAt(path, 0.01)).toMatchObject({ pose: "walk", facing: -1, landed: null });
    const firstClimb = path.find((s) => s.pose === "climb")!;
    expect(climbFrameAt(path, firstClimb.at + firstClimb.seconds / 2)).toMatchObject({ pose: "climb", x: ladderX(3) });
    const landsOn4 = path.find((s) => s.lands === 4)!;
    expect(climbFrameAt(path, landsOn4.at + landsOn4.seconds / 2).landed).toBeNull();
    expect(climbFrameAt(path, landsOn4.at + landsOn4.seconds + 0.001).landed).toBe(4);
    expect(climbFrameAt(path, climbDuration(path) + 1)).toMatchObject({ x: pinX(5), y: slabTop(5), pose: "idle", landed: 5 });
  });
});

describe("seen floor store", () => {
  it("keeps one season's floor per account, and rejects anything malformed", () => {
    const disk = new Map<string, string>();
    const opts = { load: (k: string) => disk.get(k) ?? null, save: (k: string, v: string) => void disk.set(k, v) };
    const mine = createSeenFloorStore({ ...opts, accountId: "me" });
    const theirs = createSeenFloorStore({ ...opts, accountId: "them" });
    expect(mine.get(1)).toBeNull();
    mine.set(1, 8);
    expect(mine.get(1)).toBe(8);
    expect(mine.get(2)).toBeNull();
    expect(theirs.get(1)).toBeNull();
    mine.set(1, 0);
    expect(mine.get(1)).toBe(8);

    expect(parseSeenFloor('{"season":1,"floor":8}')).toEqual({ season: 1, floor: 8 });
    for (const raw of [null, "", "nope", "[]", "null", '{"season":1}', '{"season":1,"floor":0}', '{"season":1,"floor":2.5}', '{"season":"1","floor":8}', '{"season":1,"floor":1e9}']) {
      expect(parseSeenFloor(raw), String(raw)).toBeNull();
    }
  });
});

describe("climb on the map", () => {
  let container: HTMLDivElement;
  let root: Root;
  let frames: FrameRequestCallback[];
  let clockMs: number;
  let reduceMotion: boolean;
  const realMatchMedia = window.matchMedia;

  beforeEach(() => {
    haptics.light = 0;
    frames = [];
    clockMs = 0;
    reduceMotion = false;
    localStorage.clear();
    markTutorialsSeen(["basics", ...POWER_UP_TYPES]);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    window.matchMedia = ((query: string) => ({
      matches: reduceMotion && query.includes("reduce"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      setTransform: () => {},
      clearRect: () => {},
    } as unknown as CanvasRenderingContext2D);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.matchMedia = realMatchMedia;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function memoryClient(): LevelsClient {
    let stored: string | null = null;
    return createMockLevelsClient({ load: () => stored, save: (raw) => void (stored = raw) });
  }

  async function clearLevels(client: LevelsClient, from: number, to: number) {
    for (let n = from; n <= to; n++) {
      const s = await client.startLevel(n);
      if (!s.ok) throw new Error("refused");
      await client.submitResult(s.ticket.id, {
        finished: true,
        level: s.ticket.level,
        finishedTick: 3 * TICK_HZ,
        raceTicks: 3 * TICK_HZ,
        peakFt: s.ticket.goalFt,
        replayToken: null,
        outOfTime: false,
      });
    }
  }

  async function settle() {
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    }
  }

  /** Mounts the map afresh, as coming back from a run does. */
  async function openMap(client: LevelsClient, state: unknown = null) {
    act(() => root.unmount());
    root = createRoot(container);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[{ pathname: "/", state }]}>
          <LevelsProvider client={client}>
            <LevelMapScreen />
          </LevelsProvider>
        </MemoryRouter>,
      );
    });
    await settle();
  }

  /** Runs animation frames 1/60 s apart until none are queued, or `seconds` pass. */
  function runFrames(seconds = 20) {
    for (let i = 0; i < seconds * 60 && frames.length > 0; i++) {
      clockMs += 1000 / 60;
      const due = frames.splice(0);
      act(() => due.forEach((cb) => cb(clockMs)));
    }
  }

  const figureFloor = () => {
    const label = container.querySelector("[data-you-marker]")?.closest("li")?.querySelector("button")?.getAttribute("aria-label");
    return label ? Number(/^Level (\d+)/.exec(label)?.[1]) : null;
  };
  const climbing = () => container.querySelector("[data-climbing]") !== null;

  it("climbs all seven floors after seven wins, one step per floor", async () => {
    const client = memoryClient();
    await openMap(client);
    runFrames();
    expect(figureFloor()).toBe(1);

    await clearLevels(client, 1, 7);
    await openMap(client);
    expect(climbing()).toBe(true);
    // Before the lead-in ends it still stands at floor 1's centre.
    const marker = container.querySelector<HTMLElement>("[data-climbing]")!;
    expect(marker.style.left).toBe(`${pinX(1)}%`);

    const before = haptics.light;
    runFrames();
    expect(climbing()).toBe(false);
    expect(figureFloor()).toBe(8);
    expect(haptics.light - before).toBe(7);
  });

  it("passes behind the floors on a ladder and in front of them on a floor", async () => {
    const client = memoryClient();
    await openMap(client);
    runFrames();
    await clearLevels(client, 1, 2);
    await openMap(client);
    const marker = () => container.querySelector<HTMLElement>("[data-climbing]");
    // Drawn before every floor, so without z-10 the slabs paint over it.
    const items = [...container.querySelectorAll("ol > li")];
    const climberAt = items.findIndex((li) => li.querySelector("[data-climbing]"));
    const firstFloor = items.findIndex((li) => li.querySelector("button"));
    expect(climberAt).toBeGreaterThanOrEqual(0);
    expect(climberAt).toBeLessThan(firstFloor);

    const path = climbPath(1, 3);
    // The climber's clock starts on its first frame, the next one run.
    const began = clockMs + 1000 / 60;
    const seen = { climb: 0, walk: 0 };
    for (let i = 0; i < 60 * 10 && marker(); i++) {
      runFrames(1 / 60);
      const el = marker();
      if (!el) break;
      const t = (clockMs - began) / 1000 - CLIMB_LEAD_IN_S;
      const pose = climbFrameAt(path, t).pose;
      if (pose === "climb") {
        seen.climb++;
        expect(el.classList.contains("z-10")).toBe(false);
      } else if (pose === "walk") {
        seen.walk++;
        expect(el.classList.contains("z-10")).toBe(true);
      }
    }
    expect(seen.climb).toBeGreaterThan(0);
    expect(seen.walk).toBeGreaterThan(0);
  });

  it("waits while Next level's start card covers the map, then climbs every floor won meanwhile", async () => {
    const client = memoryClient();
    await openMap(client);
    runFrames();

    // Three wins back to back, each landing on the map with the next card open.
    for (const level of [1, 2, 3]) {
      await clearLevels(client, level, level);
      await openMap(client, { openLevel: level + 1 });
      runFrames();
      expect(climbing()).toBe(false);
      expect(figureFloor()).toBe(1);
    }

    // The start card renders in a portal on the body.
    const close = document.body.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
    expect(close).toBeTruthy();
    act(() => close!.click());
    await settle();
    expect(climbing()).toBe(true);
    const before = haptics.light;
    runFrames();
    expect(figureFloor()).toBe(4);
    expect(haptics.light - before).toBe(3);
  });

  it("starts a big jump MAX_CLIMB_FLOORS below the frontier", async () => {
    const client = memoryClient();
    await openMap(client);
    runFrames();
    const to = MAX_CLIMB_FLOORS + 6;
    await clearLevels(client, 1, to - 1);
    await openMap(client);
    expect(container.querySelector<HTMLElement>("[data-climbing]")?.style.left).toBe(`${pinX(to - MAX_CLIMB_FLOORS)}%`);
    const before = haptics.light;
    runFrames();
    expect(haptics.light - before).toBe(MAX_CLIMB_FLOORS);
    expect(figureFloor()).toBe(to);
  });

  it("stands the figure on the frontier with no climb under reduced motion, and on a first visit", async () => {
    const client = memoryClient();
    await clearLevels(client, 1, 4);
    // First visit: nothing seen yet.
    await openMap(client);
    expect(climbing()).toBe(false);
    expect(figureFloor()).toBe(5);

    reduceMotion = true;
    await clearLevels(client, 5, 6);
    await openMap(client);
    expect(climbing()).toBe(false);
    expect(figureFloor()).toBe(7);

    // Reduced motion still records the floor: turning it off later does not replay these.
    reduceMotion = false;
    await openMap(client);
    expect(climbing()).toBe(false);
    expect(figureFloor()).toBe(7);
  });

  it("does not replay a climb that started, even if the map is left mid-climb", async () => {
    const client = memoryClient();
    await openMap(client);
    runFrames();
    await clearLevels(client, 1, 2);
    await openMap(client);
    expect(climbing()).toBe(true);
    // Leave before the first step.
    await openMap(client);
    expect(climbing()).toBe(false);
    expect(figureFloor()).toBe(3);
  });

  it("stops scrolling with the figure once the player touches the map", async () => {
    const client = memoryClient();
    await openMap(client);
    runFrames();
    await clearLevels(client, 1, 7);
    await openMap(client);
    const scroller = container.querySelector("ol")!.closest<HTMLElement>(".overflow-y-auto")!;
    const writes: number[] = [];
    Object.defineProperty(scroller, "scrollTop", { configurable: true, get: () => writes.at(-1) ?? 0, set: (v: number) => void writes.push(v) });

    runFrames(CLIMB_LEAD_IN_S + 1);
    const followed = writes.length;
    expect(followed).toBeGreaterThan(0);
    act(() => scroller.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    runFrames();
    expect(climbing()).toBe(false);
    expect(writes.length).toBe(followed);
  });
});
