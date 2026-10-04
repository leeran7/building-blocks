/**
 * The mobile level map drawn as the tower: slab floors, a ladder between each
 * pair, a landing at each episode boundary, an altimeter rail on the left, and
 * the player's character on the frontier floor.
 *
 * The geometry tests call the real functions the map lays itself out with
 * (towerGeometry.ts); the render tests mount the real LevelMapScreen on the
 * device-local level store. Only auth, haptics, the network and the lava
 * painter are mocked, plus the sprite and stick painters, which are captured
 * to see which character the map draws and where its feet land.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const SAVED_AVATAR = "wolf";

const drawn = vi.hoisted(() => ({
  sprites: [] as Array<{ avatarId: unknown; fx: number; fy: number; pose: unknown }>,
  sticks: [] as Array<{ color: string; pose: unknown }>,
}));
/**
 * What GET /api/settings answers: the saved character (reset to SAVED_AVATAR
 * before each test), a 500 when `fail`, and no answer at all until `release`
 * runs when `hold` is set.
 */
const saved = vi.hoisted(() => ({
  avatarId: "wolf" as string | null,
  fail: false,
  hold: false,
  release: null as (() => void) | null,
  /** GET /api/settings calls made. */
  requests: 0,
}));

/** Who is signed in: a real account by default; the verifier's hook tests switch it. */
const auth = vi.hoisted(() => ({ kind: "account" as "account" | "anonymous" | "signedOut" }));

vi.mock("../../mobile/src/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: auth.kind === "signedOut" ? null : { uid: auth.kind === "anonymous" ? "anon" : "me" },
    isAnonymous: auth.kind === "anonymous",
    loading: false,
    signOut: vi.fn(async () => {}),
  }),
}));
vi.mock("../../mobile/src/lib/haptics", () => ({
  tapLight: vi.fn(async () => {}),
  tapMedium: vi.fn(async () => {}),
  tapHeavy: vi.fn(async () => {}),
  notifySuccess: vi.fn(async () => {}),
  notifyError: vi.fn(async () => {}),
}));
vi.mock("@app/components/Game/lava", () => ({ drawLava: vi.fn(), isLavaInProximity: () => false }));
vi.mock("../../mobile/src/lib/api", () => ({
  apiFetch: vi.fn(async (path: string) => {
    if (path === "/api/settings") saved.requests++;
    if (path === "/api/settings" && saved.hold) await new Promise<void>((done) => void (saved.release = done));
    if (path === "/api/settings" && saved.fail) return { ok: false, status: 500, json: () => Promise.resolve({}) } as Response;
    const body = path === "/api/settings" ? { leaderboardConsent: true, avatarId: saved.avatarId } : {};
    return { ok: true, status: 200, json: () => Promise.resolve(body) } as Response;
  }),
  API_BASE: "https://example.test",
}));
vi.mock("@app/components/Game/paintClimbFrame", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/components/Game/paintClimbFrame")>();
  return {
    ...real,
    drawClimber: (_ctx: unknown, _fx: number, _fy: number, _s: number, _facing: number, pose: unknown, _tick: number, color: string) => {
      drawn.sticks.push({ color, pose });
    },
  };
});
vi.mock("@app/components/Game/climberSprite", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/components/Game/climberSprite")>();
  return {
    ...real,
    drawClimberSprite: (_ctx: unknown, fx: number, fy: number, _s: number, _facing: number, state: { avatarId: unknown; pose: unknown }) => {
      drawn.sprites.push({ avatarId: state.avatarId, fx, fy, pose: state.pose });
      return true;
    },
  };
});

import { apiFetch } from "../../mobile/src/lib/api";
import { AppDataProvider, useEquippedAvatar, type EquippedAvatar } from "../../mobile/src/contexts/AppDataContext";
import { LevelsProvider, useLevels } from "../../mobile/src/contexts/LevelsContext";
import { PREVIEW_FOOT_PAD } from "../../mobile/src/components/CharacterPreview";
import { TowerMap } from "../../mobile/src/components/levels/TowerMap";
import { climberStickColor } from "../../src/components/Game/climberSprite";
import { createMockLevelsClient, SEASON_LENGTH } from "../../mobile/src/lib/levels/mockClient";
import { EPISODE_SIZE, episodeOf, type LevelNode, type LevelsClient } from "../../mobile/src/lib/levels/model";
import { LevelMapScreen, MAP_FADE } from "../../mobile/src/screens/LevelMapScreen";
import {
  FIGURE_CANVAS_PX,
  FIGURE_PX,
  LADDER_GAP,
  LADDER_W,
  LANDING_H,
  RAIL_TICK_W,
  RAIL_X,
  SLAB_DEPTH_PX,
  SLAB_H,
  SLAB_MAX_X,
  SLAB_MIN_X,
  SLAB_W,
  STAR_DROP_PX,
  STAR_GAP_PX,
  STAR_PX,
  TICK_PITCH,
  isEpisodeTop,
  ladderSpans,
  ladderX,
  landingBottom,
  pinBottom,
  pinX,
  slabRange,
  slabTop,
  slabUnderside,
  towerHeight,
} from "../../mobile/src/components/levels/towerGeometry";
import { TICK_HZ } from "../../src/game/types";
import { POWER_UP_TYPES } from "../../src/game/powerups";
import { markTutorialsSeen } from "../../mobile/src/lib/levels/tutorialSeen";

/** Three whole episodes and the first floor of a fourth. */
const TOP = 3 * EPISODE_SIZE + 1;
/** The narrowest phone the map is laid out for, CSS px. */
const NARROWEST_MAP_PX = 320;
const MIN_TAP_PX = 44;
/** A ladder keeps at least this much slab on each side of it, % of the map's width. */
const LADDER_INSET = 2;
/** Clear space between the rail's longest tick and the nearest slab, % of the map's width. */
const RAIL_CLEARANCE = 3;
/** The fade's solid stop, px: the largest length in MAP_FADE. */
const fadeSolidFrom = () => Math.max(...[...MAP_FADE.matchAll(/(\d+)px/g)].map((m) => Number(m[1])));

describe("tower geometry", () => {
  it("stands every ladder inside both of the slabs it joins", () => {
    let checked = 0;
    for (let n = 1; n < TOP; n++) {
      const left = ladderX(n) - LADDER_W / 2;
      const right = ladderX(n) + LADDER_W / 2;
      for (const slab of [slabRange(n), slabRange(n + 1)]) {
        expect(left, `ladder ${n} left rail`).toBeGreaterThanOrEqual(slab.left + LADDER_INSET);
        expect(right, `ladder ${n} right rail`).toBeLessThanOrEqual(slab.right - LADDER_INSET);
        checked++;
      }
    }
    expect(checked).toBe(2 * (TOP - 1));
  });

  it("keeps every slab inside the map, clear of the altimeter rail, and tappable", () => {
    expect(RAIL_X).toBeGreaterThan(0);
    expect(RAIL_X + RAIL_TICK_W + RAIL_CLEARANCE).toBeLessThanOrEqual(SLAB_MIN_X);
    expect(SLAB_MAX_X).toBeLessThanOrEqual(100);
    for (let n = 1; n <= TOP; n++) {
      const { left, right } = slabRange(n);
      expect(left, `slab ${n} left`).toBeGreaterThanOrEqual(SLAB_MIN_X);
      expect(right, `slab ${n} right`).toBeLessThanOrEqual(SLAB_MAX_X);
      expect(right - left).toBeCloseTo(SLAB_W, 9);
      expect((left + right) / 2).toBeCloseTo(pinX(n), 9);
    }
    expect(SLAB_H).toBeGreaterThanOrEqual(MIN_TAP_PX);
    expect((SLAB_W / 100) * NARROWEST_MAP_PX).toBeGreaterThanOrEqual(MIN_TAP_PX);
  });

  it("keeps the whole of floor 1 above the Play bar fade's solid stop", () => {
    const solidFrom = fadeSolidFrom();
    expect(solidFrom).toBeGreaterThan(0);
    expect(pinBottom(1)).toBeGreaterThan(solidFrom);
    expect(slabUnderside(1)).toBeGreaterThan(solidFrom);
  });

  it("keeps the stars under floor 1 above the Play bar fade's solid stop", () => {
    expect(STAR_DROP_PX).toBe(STAR_GAP_PX + STAR_PX);
    expect(slabUnderside(1) - STAR_DROP_PX).toBeGreaterThan(fadeSolidFrom());
  });

  it("fits the character in its canvas and in the air over its floor", () => {
    // The figure stands on the canvas's foot pad and its head stays inside the canvas.
    expect(FIGURE_PX + PREVIEW_FOOT_PAD).toBeLessThanOrEqual(FIGURE_CANVAS_PX);
    // The canvas hangs the foot pad below the floor's top: what rises above it must fit under the next floor.
    expect(FIGURE_CANVAS_PX - PREVIEW_FOOT_PAD).toBeLessThanOrEqual(LADDER_GAP);
    // On a cleared season's top floor, the canvas stays inside the map.
    expect(slabTop(TOP) + FIGURE_CANVAS_PX - PREVIEW_FOOT_PAD).toBeLessThanOrEqual(towerHeight(TOP));
  });

  it("climbs strictly, with a figure's headroom over every floor", () => {
    for (let n = 1; n < TOP; n++) {
      expect(pinBottom(n + 1), `floor ${n + 1}`).toBeGreaterThan(pinBottom(n));
      expect(slabUnderside(n + 1) - slabTop(n), `air over floor ${n}`).toBeGreaterThanOrEqual(LADDER_GAP);
    }
    expect(LADDER_GAP).toBeGreaterThanOrEqual(FIGURE_PX);
    expect(towerHeight(TOP)).toBeGreaterThan(slabTop(TOP));
    expect(towerHeight(0)).toBe(0);
  });

  it("leaves room for the landing at every episode boundary", () => {
    let boundaries = 0;
    for (let n = 1; n < TOP; n++) {
      if (!isEpisodeTop(n)) continue;
      boundaries++;
      expect(episodeOf(n + 1)).toBe(episodeOf(n) + 1);
      const landing = landingBottom(episodeOf(n + 1));
      // A ladder gap of air under the landing (the figure may stand there) and over it.
      expect(landing - LANDING_H / 2 - slabTop(n), `under landing ${boundaries}`).toBeGreaterThanOrEqual(LADDER_GAP);
      expect(slabUnderside(n + 1) - (landing + LANDING_H / 2), `over landing ${boundaries}`).toBeGreaterThanOrEqual(LADDER_GAP);
    }
    expect(boundaries).toBe(3);
  });

  it("runs each ladder from its floor to the next, stopping at a landing", () => {
    let split = 0;
    for (let n = 1; n < TOP; n++) {
      const spans = ladderSpans(n);
      expect(spans[0][0]).toBe(slabTop(n));
      expect(spans[spans.length - 1][1]).toBe(slabUnderside(n + 1));
      for (const [from, to] of spans) expect(to - from, `ladder ${n}`).toBeGreaterThanOrEqual(LADDER_GAP);
      expect(spans.length).toBe(isEpisodeTop(n) ? 2 : 1);
      if (spans.length < 2) continue;
      split++;
      const landing = landingBottom(episodeOf(n + 1));
      expect(spans[0][1]).toBe(landing - LANDING_H / 2);
      expect(spans[1][0]).toBe(landing + LANDING_H / 2);
    }
    expect(split).toBe(3);
  });

  it("keeps each slab block's receding faces on screen and clear of the floor above", () => {
    // The side face reaches SLAB_DEPTH_PX right of the slab; the rightmost slabs end at SLAB_MAX_X.
    expect(SLAB_DEPTH_PX).toBeGreaterThan(0);
    expect(SLAB_DEPTH_PX).toBeLessThanOrEqual(((100 - SLAB_MAX_X) / 100) * NARROWEST_MAP_PX);
    // The top face rises SLAB_DEPTH_PX over the slab: under the stars hung from the next floor or landing.
    for (let n = 1; n < TOP; n++) {
      const above = isEpisodeTop(n) ? landingBottom(episodeOf(n + 1)) - LANDING_H / 2 : slabUnderside(n + 1) - STAR_DROP_PX;
      expect(slabTop(n) + SLAB_DEPTH_PX, `top face of floor ${n}`).toBeLessThanOrEqual(above);
    }
  });

  it("puts every floor's top surface on the altimeter's tick lattice", () => {
    for (let n = 1; n <= TOP; n++) expect(slabTop(n) % TICK_PITCH, `floor ${n}`).toBe(0);
  });
});

describe("tower map", () => {
  let container: HTMLDivElement;
  let root: Root;
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    drawn.sprites = [];
    saved.avatarId = SAVED_AVATAR;
    saved.fail = false;
    saved.hold = false;
    saved.release = null;
    saved.requests = 0;
    auth.kind = "account";
    drawn.sticks = [];
    frames = [];
    localStorage.clear();
    markTutorialsSeen(["basics", ...POWER_UP_TYPES]);
    // The character canvas paints from an animation frame onto a 2D context.
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function memoryClient(): LevelsClient {
    let stored: string | null = null;
    return createMockLevelsClient({ load: () => stored, save: (raw) => void (stored = raw) });
  }

  async function clearLevels(client: LevelsClient, upTo: number) {
    for (let n = 1; n <= upTo; n++) {
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

  async function renderMap(client: LevelsClient, wrap: (el: ReactElement) => ReactElement = (el) => el) {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/"]}>
          {wrap(
            <LevelsProvider client={client}>
              <LevelMapScreen />
            </LevelsProvider>,
          )}
        </MemoryRouter>,
      );
    });
    await settle();
  }

  /** Lets pending fetches and the state they set land. */
  async function settle() {
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    }
  }

  /** Paints one animation frame of whatever is waiting to draw. */
  function paintFrame() {
    const due = frames.splice(0);
    act(() => due.forEach((cb) => cb(performance.now())));
  }

  const floor = (label: string) =>
    [...container.querySelectorAll<HTMLButtonElement>("ol button")]
      .find((b) => b.getAttribute("aria-label") === label)
      ?.closest("li");

  const railButtons = () =>
    [...container.querySelectorAll('[data-tour="modes"] button')].map((b) => b.getAttribute("aria-label"));

  it("puts the mode rail (Daily, Versus, Ranks) on a player's map", async () => {
    await renderMap(memoryClient(), (el) => createElement(AppDataProvider, null, el));
    expect(railButtons()).toEqual(["Daily Climb", "Versus", "Ranks"]);
  });

  it("leaves the mode rail off a map with no app data behind it (the guest taster)", async () => {
    await renderMap(memoryClient());
    expect(container.querySelector("ol button")).not.toBeNull();
    expect(container.querySelector('[data-tour="modes"]')).toBeNull();
  });

  it("keeps the mode rail reachable when the level map fails to load", async () => {
    const client = memoryClient();
    client.getSeason = async () => {
      throw new Error("down");
    };
    await renderMap(client, (el) => createElement(AppDataProvider, null, el));
    expect(container.textContent).toContain("Couldn’t load the level map.");
    expect(railButtons()).toEqual(["Daily Climb", "Versus", "Ranks"]);
  });

  it("keeps a Quick Play search running when the level map loads behind it", async () => {
    const client = memoryClient();
    const realSeason = client.getSeason.bind(client);
    let down = true;
    client.getSeason = async () => {
      if (down) throw new Error("down");
      return realSeason();
    };
    await renderMap(client, (el) => createElement(AppDataProvider, null, el));
    const press = async (el: Element | null | undefined) => {
      if (!el) throw new Error("nothing to press");
      await act(async () => (el as HTMLElement).click());
      await settle();
    };
    const matchmaking = () => document.querySelector('[role="dialog"][aria-label="Matchmaking"]');
    const joins = () =>
      vi.mocked(apiFetch).mock.calls.filter(([path, init]) => path === "/api/duel/queue" && init?.method === "POST").length;
    const joinsBefore = joins();

    await press(container.querySelector('button[aria-label="Versus"]'));
    await press(document.querySelector('button[aria-label="Quick play, find a random opponent"]'));
    expect(matchmaking()).not.toBeNull();
    expect(joins()).toBe(joinsBefore + 1);

    down = false;
    await press([...container.querySelectorAll("button")].find((b) => b.textContent === "Try again"));
    // The map is up, and the same search is still on screen: no new join, no dropped overlay.
    expect(container.querySelector("ol button")).not.toBeNull();
    expect(matchmaking()).not.toBeNull();
    expect(joins()).toBe(joinsBefore + 1);
  });

  it("stands the character on the frontier floor and on no other", async () => {
    const client = memoryClient();
    await clearLevels(client, 3);
    await renderMap(client);

    const frontier = floor("Level 4, next to play");
    expect(frontier).toBeTruthy();
    const figures = container.querySelectorAll("[data-character-preview]");
    expect(figures.length).toBe(1);
    expect(frontier?.contains(figures[0])).toBe(true);
    expect(floor("Level 3, 3 of 3 stars")?.querySelector("[data-character-preview]")).toBeNull();
    expect(floor("Level 5, locked")?.querySelector("[data-character-preview]")).toBeNull();

    // Decorative: hidden from assistive tech, outside the button, and never a tap target.
    const marker = figures[0].closest("[data-you-marker]");
    expect(marker?.getAttribute("aria-hidden")).toBe("true");
    expect(marker?.className).toContain("pointer-events-none");
    expect(figures[0].closest("button")).toBeNull();
  });

  it("moves the character up when the frontier moves", async () => {
    const client = memoryClient();
    await renderMap(client);
    expect(floor("Level 1, next to play")?.querySelector("[data-character-preview]")).toBeTruthy();

    await clearLevels(client, 1);
    act(() => root.unmount());
    root = createRoot(container);
    await renderMap(client);
    expect(container.querySelectorAll("[data-character-preview]").length).toBe(1);
    expect(floor("Level 2, next to play")?.querySelector("[data-character-preview]")).toBeTruthy();
    expect(floor("Level 1, 3 of 3 stars")?.querySelector("[data-character-preview]")).toBeNull();
  });

  it("points the first-run tour's level step at the frontier floor and no other", async () => {
    const client = memoryClient();
    await clearLevels(client, 3);
    await renderMap(client);

    const targets = container.querySelectorAll('[data-tour="next-level"]');
    expect(targets.length).toBe(1);
    expect(targets[0].getAttribute("aria-label")).toBe("Level 4, next to play");
  });

  it("draws the saved character, idle, with its feet on the slab's top edge", async () => {
    await renderMap(memoryClient(), (el) => createElement(AppDataProvider, null, el));
    paintFrame();
    paintFrame();

    const last = drawn.sprites[drawn.sprites.length - 1];
    expect(last?.avatarId).toBe(SAVED_AVATAR);
    expect(last?.pose).toBe("idle");
    // The canvas hangs PREVIEW_FOOT_PAD below the slab's top, which is where its feet are drawn.
    const canvas = container.querySelector<HTMLCanvasElement>("[data-character-preview]");
    const size = parseFloat(canvas?.style.height ?? "");
    expect(last?.fy).toBe(size - PREVIEW_FOOT_PAD);
    expect(last?.fx).toBe(size / 2);
    expect(canvas?.closest<HTMLElement>("[data-you-marker]")?.style.bottom).toBe(`calc(100% - ${PREVIEW_FOOT_PAD}px)`);
  });

  it("lays each floor out where the geometry says, as a slab-sized tap target", async () => {
    const client = memoryClient();
    await clearLevels(client, 3);
    await renderMap(client);

    const labels: Array<[number, string]> = [
      [1, "Level 1, 3 of 3 stars"],
      [4, "Level 4, next to play"],
      [5, "Level 5, locked"],
    ];
    for (const [level, label] of labels) {
      const li = floor(label) as HTMLElement | undefined;
      expect(li?.style.bottom, label).toBe(`${slabUnderside(level)}px`);
      expect(li?.style.height, label).toBe(`${SLAB_H}px`);
      expect(li?.style.left, label).toBe(`${slabRange(level).left}%`);
      expect(li?.style.width, label).toBe(`${SLAB_W}%`);
    }
  });

  it("lights the ladders up to the frontier and breaks the ones above it", async () => {
    const client = memoryClient();
    await clearLevels(client, 3);
    await renderMap(client);

    const rails = (kind: string) =>
      (container.querySelector(`svg [data-ladders="${kind}"]`)?.getAttribute("d")?.match(/V/g) ?? []).length;
    // Frontier 4: ladders 1-2, 2-3 and 3-4 are whole (two rails each). The ten
    // above, to the last shown floor, keep a split left rail and a short right one.
    expect(rails("lit")).toBe(3 * 2);
    expect(rails("broken")).toBe(10 * 3);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("has no lit ladder before the first clear, and says how many floors lie above", async () => {
    await renderMap(memoryClient());
    expect(container.querySelector('svg [data-ladders="lit"]')).toBeNull();
    expect(container.querySelector('svg [data-ladders="broken"]')).toBeTruthy();
    const shown = container.querySelectorAll("ol button").length;
    const total = (await memoryClient().getSeason()).levels.length;
    expect(total).toBeGreaterThan(shown);
    expect(container.querySelector("ol")?.textContent).toContain(`${total - shown} more floors`);
  });

  it("puts a landing under the first floor of the next episode", async () => {
    const client = memoryClient();
    await clearLevels(client, EPISODE_SIZE - 5);
    await renderMap(client);

    const landings = [...container.querySelectorAll<HTMLElement>("ol > li[data-landing]")];
    expect(landings.length).toBe(1);
    expect(landings[0].textContent).toBe("Episode 2");
    expect(landings[0].getAttribute("aria-hidden")).toBe("true");
    expect(landings[0].style.bottom).toBe(`${landingBottom(2) - LANDING_H / 2}px`);
    expect(landings[0].style.height).toBe(`${LANDING_H}px`);
  });

  // ---- Added by the verifier: what the acceptance criteria promise, asserted on the rendered map. ----

  /** Clears `level` in a time picked from its own star times, so a fixture can earn 1, 2 or 3 stars. */
  async function clearIn(client: LevelsClient, level: number, ms: (pars: LevelNode["pars"]) => number) {
    const s = await client.startLevel(level);
    if (!s.ok) throw new Error("refused");
    const tick = Math.round((ms(s.ticket.pars) / 1000) * TICK_HZ);
    await client.submitResult(s.ticket.id, {
      finished: true,
      level: s.ticket.level,
      finishedTick: tick,
      raceTicks: tick,
      peakFt: s.ticket.goalFt,
      replayToken: null,
      outOfTime: false,
    });
  }

  const floorButtons = () => [...container.querySelectorAll<HTMLButtonElement>("ol button")];
  const px = (value: string | undefined) => {
    const n = parseFloat(value ?? "");
    if (!value?.endsWith("px") || Number.isNaN(n)) throw new Error(`not a px length: ${value}`);
    return n;
  };
  /** Rails drawn in a ladder path: two per whole stretch, three per broken one. */
  const railsIn = (kind: "lit" | "broken") =>
    (container.querySelector(`svg [data-ladders="${kind}"]`)?.getAttribute("d")?.match(/V/g) ?? []).length;

  it("names every floor by its state: stars, hard, next to play, locked", async () => {
    const client = memoryClient();
    await clearIn(client, 1, (p) => p.threeStarMs);
    await clearIn(client, 2, (p) => p.twoStarMs);
    await clearIn(client, 3, (p) => p.twoStarMs + 1000);
    await clearIn(client, 4, (p) => p.threeStarMs);
    // The fixture must really hold a 2-star and a 1-star clear, or the labels below prove less than they say.
    const season = await client.getSeason();
    expect(season.levels.slice(0, 4).map((l) => l.stars)).toEqual([3, 2, 1, 3]);
    expect(season.frontier).toBe(5);
    await renderMap(client);

    const buttons = floorButtons();
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Level 1, 3 of 3 stars",
      "Level 2, 2 of 3 stars",
      "Level 3, 1 of 3 stars",
      "Level 4, 3 of 3 stars",
      "Level 5, hard, next to play",
      "Level 6, locked",
      "Level 7, locked",
      "Level 8, locked",
      "Level 9, locked",
      "Level 10, locked",
      "Level 11, locked",
      "Level 12, locked",
      "Level 13, locked",
      "Level 14, locked",
      "Level 15, locked",
    ]);
    // Only the frontier is the current step; only the floors above it are disabled.
    expect(buttons.map((b) => b.getAttribute("aria-current"))).toEqual([
      null, null, null, null, "step", null, null, null, null, null, null, null, null, null, null,
    ]);
    expect(buttons.map((b) => b.disabled)).toEqual([
      false, false, false, false, false, true, true, true, true, true, true, true, true, true, true,
    ]);
    expect(buttons.every((b) => b.type === "button")).toBe(true);
    expect(container.querySelector("ol")?.getAttribute("aria-label")).toBe("Season 1 levels");
  });

  it("keeps 'hard' in a cleared Hard floor's name and drops the current step once it is cleared", async () => {
    const client = memoryClient();
    await clearLevels(client, 5);
    await renderMap(client);

    const labels = floorButtons().map((b) => b.getAttribute("aria-label"));
    expect(labels[4]).toBe("Level 5, hard, 3 of 3 stars");
    expect(labels[5]).toBe("Level 6, next to play");
    expect(labels[9]).toBe("Level 10, locked");
    expect(container.querySelectorAll('ol [aria-current]').length).toBe(1);
    expect(floorButtons()[5].getAttribute("aria-current")).toBe("step");
  });

  it("opens the tapped floor's start card, and nothing for a locked floor", async () => {
    const client = memoryClient();
    await clearLevels(client, 3);
    await renderMap(client);
    const tap = async (label: string) => {
      const b = floorButtons().find((x) => x.getAttribute("aria-label") === label);
      if (!b) throw new Error(`no floor named ${label}`);
      await act(async () => b.click());
    };

    await tap("Level 6, locked");
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();

    await tap("Level 2, 3 of 3 stars");
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.querySelector('button[aria-label="Play level 2"]')).toBeTruthy();
  });

  it("gives every floor a tap target of at least 44px on the narrowest phone", async () => {
    const client = memoryClient();
    await clearLevels(client, 3);
    await renderMap(client);

    const buttons = floorButtons();
    expect(buttons.length).toBe(14);
    for (const b of buttons) {
      const li = b.closest("li") as HTMLElement;
      const name = b.getAttribute("aria-label") ?? "";
      expect(px(li.style.height), name).toBeGreaterThanOrEqual(MIN_TAP_PX);
      expect(li.style.width.endsWith("%"), name).toBe(true);
      expect((parseFloat(li.style.width) / 100) * NARROWEST_MAP_PX, name).toBeGreaterThanOrEqual(MIN_TAP_PX);
      // The button is the whole slab, and the only thing in its list item a pointer can reach.
      expect(b.parentElement, name).toBe(li);
      expect(b.className.split(/\s+/), name).toEqual(expect.arrayContaining(["h-full", "w-full"]));
    }
  });

  it("draws every floor and landing as a block of the map's depth", async () => {
    const client = memoryClient();
    await clearLevels(client, EPISODE_SIZE - 1);
    await renderMap(client);

    const map = container.querySelector("ol")?.parentElement as HTMLElement;
    expect(map.style.getPropertyValue("--slab-depth")).toBe(`${SLAB_DEPTH_PX}px`);
    const buttons = floorButtons();
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      const classes = b.className.split(/\s+/);
      const name = b.getAttribute("aria-label") ?? "";
      expect(classes, name).toContain("tower-slab");
      // Only a locked floor is the unlit wireframe.
      expect(classes.includes("tower-slab-ghost"), name).toBe(b.disabled);
    }
    expect(buttons.some((b) => b.disabled)).toBe(true);
    expect(buttons.some((b) => !b.disabled)).toBe(true);
    const landings = container.querySelectorAll("ol > li[data-landing]");
    expect(landings.length).toBeGreaterThan(0);
    for (const l of landings) expect(l.className.split(/\s+/)).toContain("tower-slab");
  });

  it("hides every decorative layer from assistive tech and from the pointer", async () => {
    const client = memoryClient();
    await clearLevels(client, 10);
    await renderMap(client);

    const map = container.querySelector("ol")?.parentElement as HTMLElement;
    const rail = map.querySelector(".altimeter");
    const svg = map.querySelector("svg[viewBox]");
    const marker = map.querySelector("[data-you-marker]");
    for (const [name, el] of [["rail", rail], ["ladders", svg], ["character", marker]] as const) {
      expect(el, name).toBeTruthy();
      expect(el?.getAttribute("aria-hidden"), name).toBe("true");
      expect((el?.getAttribute("class") ?? "").split(/\s+/), name).toContain("pointer-events-none");
      expect(el?.querySelector("button, a, [tabindex]"), name).toBeNull();
    }
    // The rail and the ladders sit outside the list: the list holds floors and hidden scenery only.
    expect(rail?.closest("ol")).toBeNull();
    expect(svg?.closest("ol")).toBeNull();
    const items = [...(container.querySelector("ol")?.children ?? [])];
    expect(items.every((el) => el.tagName === "LI")).toBe(true);
    const scenery = items.filter((el) => el.getAttribute("aria-hidden") === "true");
    const floors = items.filter((el) => el.getAttribute("aria-hidden") !== "true");
    // Frontier 11 shows floors 1-21: one landing (Episode 2) and the "more floors" fade.
    expect(scenery.length).toBe(2);
    expect(scenery.every((el) => el.querySelector("button") === null)).toBe(true);
    expect(floors.length).toBe(21);
    expect(floors.every((el) => el.querySelectorAll("button").length === 1)).toBe(true);
    // Nothing a screen reader skips holds a floor's button.
    expect(floorButtons().every((b) => b.closest('[aria-hidden="true"]') === null)).toBe(true);
  });

  it("stands the character under the landing when the frontier is an episode's last floor", async () => {
    const client = memoryClient();
    await clearLevels(client, EPISODE_SIZE - 1);
    await renderMap(client);

    const last = floor(`Level ${EPISODE_SIZE}, hard, next to play`) as HTMLElement | undefined;
    expect(last?.querySelector("[data-character-preview]")).toBeTruthy();
    expect(container.querySelectorAll("[data-character-preview]").length).toBe(1);
    const landing = container.querySelector<HTMLElement>("ol > li[data-landing]");
    expect(landing?.textContent).toBe("Episode 2");
    const next = floor(`Level ${EPISODE_SIZE + 1}, locked`) as HTMLElement | undefined;
    // The landing lies between the two floors, with the figure's height of air under it.
    const floorTop = px(last?.style.bottom) + px(last?.style.height);
    expect(px(landing?.style.bottom) - floorTop).toBeGreaterThanOrEqual(FIGURE_CANVAS_PX - PREVIEW_FOOT_PAD);
    expect(px(next?.style.bottom)).toBeGreaterThan(px(landing?.style.bottom) + px(landing?.style.height));
    // 14 whole ladders below; above, ten broken ones, the first cut in two by the landing.
    expect(railsIn("lit")).toBe(14 * 2);
    expect(railsIn("broken")).toBe(11 * 3);
  });

  it("carries the lit ladder through the landing once the next episode is open", async () => {
    const client = memoryClient();
    await clearLevels(client, EPISODE_SIZE);
    await renderMap(client);

    const first = floor(`Level ${EPISODE_SIZE + 1}, next to play`);
    expect(first?.querySelector("[data-character-preview]")).toBeTruthy();
    expect(container.querySelectorAll("[data-character-preview]").length).toBe(1);
    expect(floor(`Level ${EPISODE_SIZE}, hard, 3 of 3 stars`)?.querySelector("[data-character-preview]")).toBeNull();
    expect(container.querySelectorAll("ol > li[data-landing]").length).toBe(1);
    // 15 lit ladders, the last cut in two by the landing; ten whole-length broken ones above.
    expect(railsIn("lit")).toBe(16 * 2);
    expect(railsIn("broken")).toBe(10 * 3);
  });

  it("draws a fully cleared season: every floor open, the character on the top one, nothing above", async () => {
    const client = memoryClient();
    await clearLevels(client, SEASON_LENGTH);
    const season = await client.getSeason();
    expect(season.frontier).toBe(SEASON_LENGTH);
    expect(season.levels[SEASON_LENGTH - 1].stars).toBe(3);
    await renderMap(client);

    const buttons = floorButtons();
    expect(buttons.length).toBe(SEASON_LENGTH);
    expect(buttons.filter((b) => b.disabled).length).toBe(0);
    expect(container.querySelectorAll("ol [aria-current]").length).toBe(0);
    expect(buttons[SEASON_LENGTH - 1].getAttribute("aria-label")).toBe(`Level ${SEASON_LENGTH}, hard, 3 of 3 stars`);
    const figures = container.querySelectorAll("[data-character-preview]");
    expect(figures.length).toBe(1);
    expect(buttons[SEASON_LENGTH - 1].closest("li")?.contains(figures[0])).toBe(true);
    expect(container.querySelector("ol")?.textContent).not.toContain("more floors");
    expect(container.querySelector('svg [data-ladders="broken"]')).toBeNull();
    const landings = [...container.querySelectorAll("ol > li[data-landing]")];
    expect(landings.length).toBe(SEASON_LENGTH / EPISODE_SIZE - 1);
    expect(landings[landings.length - 1].textContent).toBe(`Episode ${SEASON_LENGTH / EPISODE_SIZE}`);
    // Every ladder lit: one stretch each, two where a landing cuts it.
    expect(railsIn("lit")).toBe((SEASON_LENGTH - 1 + landings.length) * 2);
    const map = container.querySelector("ol")?.parentElement as HTMLElement;
    expect(px(map.style.height)).toBe(towerHeight(SEASON_LENGTH));
  });

  // ---- Iteration 2: the figure's loading state and frame budget, stars, the "more floors" line, the header. ----

  it("draws no figure while the saved character loads, with the floor drawn and tappable meanwhile", async () => {
    saved.hold = true;
    await renderMap(memoryClient(), (el) => createElement(AppDataProvider, null, el));
    const frontier = floor("Level 1, next to play");
    expect(frontier).toBeTruthy();
    expect(container.querySelector("[data-character-preview]")).toBeNull();
    paintFrame();
    expect(drawn.sticks.length + drawn.sprites.length).toBe(0);

    await act(async () => frontier?.querySelector("button")?.click());
    expect(document.body.querySelector('[role="dialog"]')).toBeTruthy();

    expect(saved.release).not.toBeNull();
    await act(async () => saved.release?.());
    await settle();
    expect(frontier?.querySelectorAll("[data-character-preview]").length).toBe(1);
    paintFrame();
    expect(drawn.sprites.map((d) => d.avatarId)).toEqual([SAVED_AVATAR]);
    // The default climber was never drawn first.
    expect(drawn.sticks).toEqual([]);
  });

  it("draws the default climber when the account has no saved character", async () => {
    saved.avatarId = null;
    await renderMap(memoryClient(), (el) => createElement(AppDataProvider, null, el));
    paintFrame();
    expect(drawn.sprites).toEqual([]);
    expect(drawn.sticks).toEqual([{ color: climberStickColor(null), pose: "idle" }]);
  });

  it("paints the standing default climber once and then asks for no more frames", async () => {
    await renderMap(memoryClient());
    paintFrame();
    expect(drawn.sticks.length).toBe(1);
    expect(frames.length).toBe(0);
    paintFrame();
    expect(drawn.sticks.length).toBe(1);
  });

  it("hangs each cleared floor's stars STAR_GAP_PX under it, STAR_PX each", async () => {
    const client = memoryClient();
    await clearLevels(client, 3);
    await renderMap(client);
    let checked = 0;
    for (const label of ["Level 1, 3 of 3 stars", "Level 2, 3 of 3 stars", "Level 3, 3 of 3 stars"]) {
      const row = floor(label)?.querySelector<HTMLElement>("[data-floor-stars]");
      expect(row?.style.top, label).toBe(`calc(100% + ${STAR_GAP_PX}px)`);
      const stars = [...(row?.querySelectorAll("svg") ?? [])];
      expect(stars.length, label).toBe(3);
      for (const star of stars) expect(star.getAttribute("height"), label).toBe(String(STAR_PX));
      checked++;
    }
    expect(checked).toBe(3);
    expect(floor("Level 4, next to play")?.querySelector("[data-floor-stars]")).toBeNull();
  });

  describe("drawn on its own", () => {
    async function season() {
      return (await memoryClient().getSeason()).levels;
    }

    async function renderTower(levels: LevelNode[], frontier: number, floorsAbove: number) {
      await act(async () => {
        root.render(
          <TowerMap
            seasonName="Season 1"
            levels={levels}
            frontier={frontier}
            floorsAbove={floorsAbove}
            height={towerHeight(levels.length)}
            avatar={{ loading: false, avatarId: null }}
            onOpen={() => {}}
          />,
        );
      });
    }

    it("shows a locked floor's number and no stars, whatever its record says", async () => {
      const levels = (await season()).slice(0, 6).map((l, i): LevelNode => ({ ...l, stars: i < 3 ? 3 : 0 }));
      // A locked floor carrying stars: the map must still draw it as locked.
      levels[4] = { ...levels[4], stars: 2 };
      await renderTower(levels, 4, 0);
      const locked = floor("Level 5, locked");
      expect(locked?.querySelector("button")?.textContent).toBe("5");
      expect(locked?.querySelector("[data-floor-stars]")).toBeNull();
      expect(locked?.querySelector('[role="img"]')).toBeNull();
      expect(floor("Level 3, 3 of 3 stars")?.querySelector("[data-floor-stars]")).toBeTruthy();
    });

    it("says '1 more floor' for one hidden floor and '2 more floors' for two", async () => {
      const levels = (await season()).slice(0, 4);
      await renderTower(levels, 1, 1);
      const text = () => container.querySelector("ol")?.textContent ?? "";
      expect(text()).toContain("1 more floor");
      expect(text()).not.toContain("more floors");
      await renderTower(levels, 1, 2);
      expect(text()).toContain("2 more floors");
      await renderTower(levels, 1, 0);
      expect(text()).not.toContain("more floor");
    });
  });

  it("pads the top of the map by the header's height and still opens on the frontier", async () => {
    const HEADER_PX = 183;
    const VIEW_PX = 640;
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.tagName === "HEADER" ? HEADER_PX : 0;
    });
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("overflow-y-auto") ? VIEW_PX : 0;
    });
    let scrolledTo: number | null = null;
    vi.spyOn(HTMLElement.prototype, "scrollTop", "set").mockImplementation(function (this: HTMLElement, v: number) {
      if (this.classList.contains("overflow-y-auto")) scrolledTo = v;
    });
    const client = memoryClient();
    await clearLevels(client, 7);
    await renderMap(client);

    const scroller = container.querySelector("ol")?.closest<HTMLElement>(".overflow-y-auto");
    expect(scroller?.style.paddingTop).toBe(`${HEADER_PX}px`);
    // The top of the tower (the "more floors" line and the highest floor) starts below the header.
    expect(scroller?.firstElementChild?.contains(container.querySelector("ol"))).toBe(true);
    // The frontier (floor 8) sits where it did before the pad: 55% down the view.
    const height = towerHeight(8 + 10);
    expect(scrolledTo).toBe(HEADER_PX + height - pinBottom(8) - VIEW_PX * 0.55);
  });

  describe("useEquippedAvatar", () => {
    function Probe({ seen }: { seen: EquippedAvatar[] }) {
      seen.push(useEquippedAvatar());
      return null;
    }

    async function probe(inProvider: boolean): Promise<EquippedAvatar[]> {
      const seen: EquippedAvatar[] = [];
      const el = createElement(Probe, { seen });
      await act(async () => {
        root.render(<MemoryRouter>{inProvider ? createElement(AppDataProvider, null, el) : el}</MemoryRouter>);
      });
      await settle();
      return seen;
    }

    it("is no character, at once and without throwing, where no AppDataProvider is mounted (test harnesses)", async () => {
      const seen = await probe(false);
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.every((v) => !v.loading && v.avatarId === null)).toBe(true);
    });

    it("is loading until settings arrive, then the saved character", async () => {
      const seen = await probe(true);
      expect(seen[0]).toEqual({ loading: true });
      expect(seen[seen.length - 1]).toEqual({ loading: false, avatarId: SAVED_AVATAR });
      // Never the default climber in between.
      expect(seen.some((v) => !v.loading && v.avatarId === null)).toBe(false);
    });

    it("is loading, then no character, when the account has none saved", async () => {
      saved.avatarId = null;
      const seen = await probe(true);
      expect(seen[0]).toEqual({ loading: true });
      expect(seen[seen.length - 1]).toEqual({ loading: false, avatarId: null });
    });

    it("is no character, not loading forever, when the settings fetch fails", async () => {
      saved.fail = true;
      const seen = await probe(true);
      expect(seen[0]).toEqual({ loading: true });
      expect(seen[seen.length - 1]).toEqual({ loading: false, avatarId: null });
    });

    // ---- Added by the verifier (iteration 2). ----

    it("is never loading for an anonymous player, and fetches nothing", async () => {
      auth.kind = "anonymous";
      const seen = await probe(true);
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.every((v) => !v.loading && v.avatarId === null)).toBe(true);
      expect(saved.requests).toBe(0);
    });

    it("is never loading when signed out, and fetches nothing", async () => {
      auth.kind = "signedOut";
      const seen = await probe(true);
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.every((v) => !v.loading && v.avatarId === null)).toBe(true);
      expect(saved.requests).toBe(0);
    });

    it("fetches settings once for a signed-in player (the positive case for the two above)", async () => {
      await probe(true);
      expect(saved.requests).toBe(1);
    });
  });

  // ---- Added by the verifier (iteration 2): the header pad over the map's life. ----

  describe("header pad", () => {
    const VIEW_PX = 640;
    let headerPx: number;
    let scrolls: number[];

    /** A ResizeObserver whose callback the test fires by hand. */
    class FakeResizeObserver {
      static made: FakeResizeObserver[] = [];
      observed: Element[] = [];
      disconnected = false;
      constructor(private readonly cb: ResizeObserverCallback) {
        FakeResizeObserver.made.push(this);
      }
      observe(el: Element) {
        this.observed.push(el);
      }
      unobserve() {}
      disconnect() {
        this.disconnected = true;
      }
      fire() {
        this.cb([], this as unknown as ResizeObserver);
      }
    }

    beforeEach(() => {
      headerPx = 183;
      scrolls = [];
      FakeResizeObserver.made = [];
      vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
        return this.tagName === "HEADER" ? headerPx : 0;
      });
      vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
        return this.classList.contains("overflow-y-auto") ? VIEW_PX : 0;
      });
      vi.spyOn(HTMLElement.prototype, "scrollTop", "set").mockImplementation(function (this: HTMLElement, v: number) {
        if (this.classList.contains("overflow-y-auto")) scrolls.push(v);
      });
    });

    const scroller = () => container.querySelector("ol")?.closest<HTMLElement>(".overflow-y-auto");
    const header = () => container.querySelector("header");
    /** Where the screen should scroll for `frontier`: 55% down the view, below the pad. */
    const openAt = (frontier: number, pad: number) =>
      pad + towerHeight(frontier + 10) - pinBottom(frontier) - VIEW_PX * 0.55;

    it("observes the header, re-pads on resize without scrolling again, and disconnects on unmount", async () => {
      vi.stubGlobal("ResizeObserver", FakeResizeObserver);
      const client = memoryClient();
      await clearLevels(client, 7);
      await renderMap(client);

      // One scroll, made after the measurement: never one without the pad.
      expect(scrolls).toEqual([openAt(8, 183)]);
      expect(scroller()?.style.paddingTop).toBe("183px");
      const watching = FakeResizeObserver.made.filter((o) => o.observed.includes(header() as Element));
      expect(watching.length).toBe(1);

      headerPx = 231;
      act(() => watching[0].fire());
      expect(scroller()?.style.paddingTop).toBe("231px");
      // Once per frontier: a later pad change does not yank the view.
      expect(scrolls.length).toBe(1);

      act(() => root.unmount());
      expect(watching[0].disconnected).toBe(true);
      root = createRoot(container);
    });

    it("pads and opens on the frontier where ResizeObserver does not exist", async () => {
      vi.stubGlobal("ResizeObserver", undefined);
      expect(typeof ResizeObserver).toBe("undefined");
      const client = memoryClient();
      await clearLevels(client, 7);
      await renderMap(client);
      expect(scroller()?.style.paddingTop).toBe("183px");
      expect(scrolls).toEqual([openAt(8, 183)]);
    });

    it("scrolls once more, with the pad, when a clear moves the frontier while the map is open", async () => {
      vi.stubGlobal("ResizeObserver", FakeResizeObserver);
      const client = memoryClient();
      await clearLevels(client, 7);
      let refresh: (() => Promise<void>) | null = null;
      function Grab() {
        refresh = useLevels().refresh;
        return null;
      }
      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={["/"]}>
            <LevelsProvider client={client}>
              <LevelMapScreen />
              <Grab />
            </LevelsProvider>
          </MemoryRouter>,
        );
      });
      await settle();
      expect(scrolls).toEqual([openAt(8, 183)]);

      await clearIn(client, 8, (p) => p.threeStarMs);
      await act(async () => refresh?.());
      await settle();
      expect(floor("Level 9, next to play")).toBeTruthy();
      expect(scrolls).toEqual([openAt(8, 183), openAt(9, 183)]);
    });
  });
});
