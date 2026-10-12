/**
 * The portal's saved best height (mobile/src/portal/bestHeight.ts) and the ad
 * break helper (adBreak.ts).
 */

import { describe, expect, it, vi } from "vitest";
import { BEST_HEIGHT_KEY, loadBest, parseBest, saveBest, settleRun } from "../../mobile/src/portal/bestHeight";
import { requestBreak } from "../../mobile/src/portal/adBreak";
import type { AdsAdapter, PlatformAdapter } from "../../mobile/src/targets/types";
import { noopPlatform } from "../../mobile/src/targets/noop";

function memoryPlatform(initial: Record<string, string> = {}): PlatformAdapter & { store: Map<string, string> } {
  const store = new Map(Object.entries(initial));
  return {
    ...noopPlatform,
    store,
    loadData: async (k) => store.get(k) ?? null,
    saveData: async (k, v) => {
      store.set(k, v);
    },
  };
}

describe("parseBest", () => {
  it("accepts a finite, non-negative number", () => {
    expect(parseBest("0")).toBe(0);
    expect(parseBest("123.5")).toBe(123.5);
  });

  it("rejects everything else instead of defaulting", () => {
    for (const raw of [null, undefined, "", "  ", "abc", "-1", "NaN", "Infinity", "1e999", 5]) {
      expect(parseBest(raw)).toBeNull();
    }
  });
});

describe("settleRun (happytime only on a new best)", () => {
  it("first run on a device sets the best quietly", () => {
    expect(settleRun(null, 40)).toEqual({ best: 40, improved: true, newBest: false });
  });

  it("beating the saved best in whole feet celebrates", () => {
    expect(settleRun(40, 52.4)).toEqual({ best: 52.4, improved: true, newBest: true });
  });

  it("matching or falling short of the best does not", () => {
    expect(settleRun(40, 40)).toEqual({ best: 40, improved: false, newBest: false });
    expect(settleRun(40, 12)).toEqual({ best: 40, improved: false, newBest: false });
  });

  it("a fraction higher that rounds to the same feet saves but does not celebrate", () => {
    expect(settleRun(40.1, 40.3)).toEqual({ best: 40.3, improved: true, newBest: false });
  });

  it("a non-finite or negative peak counts as zero", () => {
    expect(settleRun(10, Number.NaN)).toEqual({ best: 10, improved: false, newBest: false });
    expect(settleRun(null, -5)).toEqual({ best: 0, improved: false, newBest: false });
  });
});

describe("loadBest / saveBest", () => {
  it("round-trips through the platform", async () => {
    const p = memoryPlatform();
    await saveBest(p, 33);
    expect(p.store.get(BEST_HEIGHT_KEY)).toBe("33");
    await expect(loadBest(p)).resolves.toBe(33);
  });

  it("never overwrites a higher stored best (a run that ended before the save loaded)", async () => {
    const p = memoryPlatform({ [BEST_HEIGHT_KEY]: "500" });
    await saveBest(p, 100);
    expect(p.store.get(BEST_HEIGHT_KEY)).toBe("500");
  });

  it("rejects a corrupt stored value and survives a throwing platform", async () => {
    await expect(loadBest(memoryPlatform({ [BEST_HEIGHT_KEY]: "lots" }))).resolves.toBeNull();
    const broken: PlatformAdapter = {
      ...noopPlatform,
      loadData: async () => {
        throw new Error("x");
      },
      saveData: async () => {
        throw new Error("y");
      },
    };
    await expect(loadBest(broken)).resolves.toBeNull();
    await expect(saveBest(broken, 5)).resolves.toBeUndefined();
  });
});

describe("requestBreak", () => {
  const ads = (midgame: AdsAdapter["midgame"], enabled = true): AdsAdapter => ({
    enabled,
    midgame,
    rewarded: async () => "unavailable",
  });

  it("skips the request when the target has no ads", async () => {
    const midgame = vi.fn(async () => "finished" as const);
    await expect(requestBreak(ads(midgame, false), () => {})).resolves.toBe("unavailable");
    expect(midgame).not.toHaveBeenCalled();
  });

  it("passes the start callback and returns the outcome", async () => {
    const onStart = vi.fn();
    const outcome = await requestBreak(
      ads(async (cb) => {
        cb?.onStart?.();
        return "finished";
      }),
      onStart,
    );
    expect(outcome).toBe("finished");
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("a throwing adapter is an error, not a crash", async () => {
    await expect(
      requestBreak(
        ads(async () => {
          throw new Error("x");
        }),
        () => {},
      ),
    ).resolves.toBe("error");
  });
});
