/**
 * Power-up feedback cues — the two defects that lived in the hook's refs.
 *
 * The hook used to keep `prevPickupTick` and `prevActiveKey` for the lifetime
 * of the mounted component. `start()` does not remount it, so a second run
 * inherited the first run's markers: a pickup landing on the same tick number
 * was silent, and a leftover effect name was announced as "ended" at the top
 * of a fresh climb. Repeating the same announcement string was also silent for
 * assistive tech, which only re-reads a live region when the text changes.
 *
 * These tests drive `stepCues` directly. A source-text grep of the hook would
 * not have caught any of this — the old hook had the refs, it just never
 * reset them.
 */

import { describe, it, expect } from "vitest";
import { POWER_UP_SPECS } from "../../src/game/powerups";
import {
  announcementText,
  initialCueMemo,
  stepCues,
  type CueInput,
  type CueMemo,
} from "../../src/components/Game/powerUpCues";

function frame(
  memo: CueMemo,
  partial: Partial<CueInput> & Pick<CueInput, "runId">
) {
  return stepCues(memo, {
    lastPickupTick: null,
    lastPickupType: null,
    activeTypes: [],
    ...partial,
  });
}

describe("stepCues: pickup is announced and scored", () => {
  it("fires pickup then activate, in that order, with the motif gap", () => {
    const { out } = frame(initialCueMemo(0), {
      runId: 0,
      lastPickupTick: 12,
      lastPickupType: "sprint-burst",
      activeTypes: ["sprint-burst"],
    });

    expect(out.sounds.map((s) => s.kind)).toEqual(["pickup", "activate"]);
    expect(out.sounds[1].delay).toBeGreaterThan(0);
    expect(announcementText(out.announcement ?? "")).toBe(
      `${POWER_UP_SPECS["sprint-burst"].label} activated. ${POWER_UP_SPECS["sprint-burst"].description}.`
    );
  });

  it("does not re-fire on the next tick of the same pickup", () => {
    let memo = initialCueMemo(0);
    const first = frame(memo, {
      runId: 0,
      lastPickupTick: 12,
      lastPickupType: "double-jump",
      activeTypes: ["double-jump"],
    });
    memo = first.memo;
    const second = frame(memo, {
      runId: 0,
      lastPickupTick: 12,
      lastPickupType: "double-jump",
      activeTypes: ["double-jump"],
    });

    expect(second.out.sounds).toEqual([]);
    expect(second.out.announcement).toBeNull();
  });
});

describe("stepCues: a new run does not inherit the previous run's cues", () => {
  it("does not announce 'ended' for an effect that died with the last run", () => {
    // Run 1 dies while sprint-burst is live — the common case, since power-ups
    // are what let you climb high enough for the lava to catch you.
    let memo = initialCueMemo(0);
    memo = frame(memo, {
      runId: 1,
      lastPickupTick: 80,
      lastPickupType: "sprint-burst",
      activeTypes: ["sprint-burst"],
    }).memo;

    const restarted = frame(memo, {
      runId: 2,
      lastPickupTick: null,
      lastPickupType: null,
      activeTypes: [],
    });

    expect(restarted.out.sounds.some((s) => s.kind === "expire")).toBe(false);
    expect(announcementText(restarted.out.announcement ?? "x")).not.toMatch(
      /ended/i
    );
  });

  it("still announces a pickup that lands on the same tick index as last run", () => {
    let memo = initialCueMemo(0);
    memo = frame(memo, {
      runId: 1,
      lastPickupTick: 40,
      lastPickupType: "rapid-climb",
      activeTypes: ["rapid-climb"],
    }).memo;

    const again = frame(memo, {
      runId: 2,
      lastPickupTick: 40,
      lastPickupType: "jetpack",
      activeTypes: ["jetpack"],
    });

    expect(again.out.sounds.map((s) => s.kind)).toEqual(["pickup", "activate"]);
    expect(announcementText(again.out.announcement ?? "")).toContain(
      POWER_UP_SPECS.jetpack.label
    );
  });
});

describe("stepCues: repeated announcements are distinct strings", () => {
  it("two identical pickups in a row produce different live-region text", () => {
    let memo = initialCueMemo(0);
    const first = frame(memo, {
      runId: 0,
      lastPickupTick: 10,
      lastPickupType: "double-jump",
      activeTypes: ["double-jump"],
    });
    const second = frame(first.memo, {
      runId: 0,
      lastPickupTick: 24,
      lastPickupType: "double-jump",
      activeTypes: ["double-jump"],
    });

    expect(first.out.announcement).not.toBeNull();
    expect(second.out.announcement).not.toBeNull();
    expect(second.out.announcement).not.toBe(first.out.announcement);
    expect(announcementText(first.out.announcement!)).toBe(
      announcementText(second.out.announcement!)
    );
  });

  it("speaks both expiry and pickup when they land on the same tick", () => {
    let memo = initialCueMemo(0);
    memo = frame(memo, {
      runId: 0,
      lastPickupTick: 10,
      lastPickupType: "sprint-burst",
      activeTypes: ["sprint-burst"],
    }).memo;

    const both = frame(memo, {
      runId: 0,
      lastPickupTick: 40,
      lastPickupType: "jetpack",
      activeTypes: ["jetpack"],
    });

    const text = announcementText(both.out.announcement ?? "");
    expect(text).toContain("ended");
    expect(text).toContain(POWER_UP_SPECS.jetpack.label);
    expect(both.out.sounds.map((s) => s.kind)).toEqual([
      "pickup",
      "activate",
      "expire",
    ]);
  });
});
