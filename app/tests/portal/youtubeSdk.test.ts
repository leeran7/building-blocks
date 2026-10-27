/**
 * YouTube Playables adapter (mobile/src/targets/youtube/sdk.ts): guarded with
 * the SDK missing or throwing, first frame before ready, pause and audio
 * mapped from ytgame.system, one JSON save blob that never drops keys.
 *
 * @vitest-environment happy-dom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createYouTubePlatform, parseSaveBlob, type YtGame } from "../../mobile/src/targets/youtube/sdk";

function fakeYt(saved = "") {
  const calls: string[] = [];
  const handlers: { pause?: () => void; resume?: () => void; audio?: (on: boolean) => void } = {};
  let blob = saved;
  const unsub = { pause: vi.fn(), resume: vi.fn(), audio: vi.fn() };
  const yt = {
    game: {
      firstFrameReady: vi.fn(() => calls.push("firstFrameReady")),
      gameReady: vi.fn(() => calls.push("gameReady")),
      loadData: vi.fn(async () => blob),
      saveData: vi.fn(async (data: string) => {
        blob = data;
      }),
    },
    system: {
      isAudioEnabled: vi.fn(() => true),
      onAudioEnabledChange: vi.fn((cb: (on: boolean) => void) => {
        handlers.audio = cb;
        return unsub.audio;
      }),
      onPause: vi.fn((cb: () => void) => {
        handlers.pause = cb;
        return unsub.pause;
      }),
      onResume: vi.fn((cb: () => void) => {
        handlers.resume = cb;
        return unsub.resume;
      }),
    },
  };
  return { yt, calls, handlers, unsub, blob: () => blob };
}

function platformWith(yt: YtGame | undefined) {
  const fallbackPauseChange = vi.fn((_cb: (p: boolean) => void) => () => {});
  return { platform: createYouTubePlatform({ getYt: () => yt, fallbackPauseChange }), fallbackPauseChange };
}

beforeEach(() => localStorage.clear());

describe("SDK missing", () => {
  it("never throws, saves locally, allows audio and uses the page's visibility for pause", async () => {
    const { platform, fallbackPauseChange } = platformWith(undefined);
    await expect(platform.init()).resolves.toBeUndefined();
    expect(() => {
      platform.loadingStart();
      platform.loadingStop();
      platform.gameplayStart();
      platform.gameplayStop();
      platform.happyMoment();
    }).not.toThrow();
    await platform.saveData("k", "12");
    await expect(platform.loadData("k")).resolves.toBe("12");
    expect(platform.isAudioAllowed()).toBe(true);
    expect(() => platform.onAudioAllowedChange(() => {})()).not.toThrow();
    platform.onPauseChange(() => {});
    expect(fallbackPauseChange).toHaveBeenCalledTimes(1);
  });
});

describe("SDK throwing", () => {
  it("every ytgame call throwing or rejecting leaves the game running on local data", async () => {
    const boom = () => {
      throw new Error("yt bug");
    };
    const yt: YtGame = {
      game: { firstFrameReady: boom, gameReady: boom, loadData: () => Promise.reject(new Error("x")), saveData: boom },
      system: { isAudioEnabled: boom, onAudioEnabledChange: boom, onPause: boom, onResume: boom },
    };
    const { platform } = platformWith(yt);
    expect(() => platform.loadingStop()).not.toThrow();
    expect(platform.isAudioAllowed()).toBe(true);
    expect(() => platform.onAudioAllowedChange(() => {})()).not.toThrow();
    expect(() => platform.onPauseChange(() => {})()).not.toThrow();
    await expect(platform.saveData("k", "4")).resolves.toBeUndefined();
    await expect(platform.loadData("k")).resolves.toBe("4");
  });

  it("a cloud save that failed to read is never overwritten", async () => {
    const { yt } = fakeYt();
    yt.game.loadData.mockRejectedValue(new Error("offline"));
    const { platform } = platformWith(yt);
    await platform.saveData("k", "8");
    expect(yt.game.saveData).not.toHaveBeenCalled();
    expect(localStorage.getItem("k")).toBe("8");
  });
});

describe("lifecycle", () => {
  it("loadingStop reports firstFrameReady then gameReady, once each", () => {
    const { yt, calls } = fakeYt();
    const { platform } = platformWith(yt);
    platform.loadingStart();
    expect(calls).toEqual([]);
    platform.loadingStop();
    platform.loadingStop();
    expect(calls).toEqual(["firstFrameReady", "gameReady"]);
  });

  it("maps onPause/onResume to onPauseChange and unsubscribes both", () => {
    const { yt, handlers, unsub } = fakeYt();
    const { platform, fallbackPauseChange } = platformWith(yt);
    const seen: boolean[] = [];
    const off = platform.onPauseChange((p) => seen.push(p));
    handlers.pause!();
    handlers.resume!();
    expect(seen).toEqual([true, false]);
    expect(fallbackPauseChange).not.toHaveBeenCalled();
    off();
    expect(unsub.pause).toHaveBeenCalledTimes(1);
    expect(unsub.resume).toHaveBeenCalledTimes(1);
  });

  it("maps isAudioEnabled and onAudioEnabledChange", () => {
    const { yt, handlers, unsub } = fakeYt();
    yt.system.isAudioEnabled.mockReturnValue(false);
    const { platform } = platformWith(yt);
    expect(platform.isAudioAllowed()).toBe(false);
    const seen: boolean[] = [];
    const off = platform.onAudioAllowedChange((a) => seen.push(a));
    handlers.audio!(true);
    handlers.audio!(false);
    expect(seen).toEqual([true, false]);
    off();
    expect(unsub.audio).toHaveBeenCalledTimes(1);
  });
});

describe("saves", () => {
  it("reads a key from the cloud blob and keeps other keys when writing", async () => {
    const { yt, blob } = fakeYt(JSON.stringify({ other: "keep", k: "3" }));
    const { platform } = platformWith(yt);
    await expect(platform.loadData("k")).resolves.toBe("3");
    await platform.saveData("k", "20");
    expect(JSON.parse(blob())).toEqual({ other: "keep", k: "20" });
    await expect(platform.loadData("k")).resolves.toBe("20");
  });

  it("an empty cloud save (first play) falls back to the local copy", async () => {
    localStorage.setItem("k", "6");
    const { yt } = fakeYt("");
    const { platform } = platformWith(yt);
    await expect(platform.loadData("k")).resolves.toBe("6");
  });
});

describe("parseSaveBlob", () => {
  it("keeps only string values of a JSON object", () => {
    expect(parseSaveBlob(JSON.stringify({ a: "1", b: 2, c: null, d: "x" }))).toEqual(
      new Map([
        ["a", "1"],
        ["d", "x"],
      ]),
    );
  });

  it("rejects anything else", () => {
    expect(parseSaveBlob("not json")).toBeNull();
    expect(parseSaveBlob("[1,2]")).toBeNull();
    expect(parseSaveBlob("42")).toBeNull();
    expect(parseSaveBlob(42)).toBeNull();
    expect(parseSaveBlob("")).toEqual(new Map());
  });
});
