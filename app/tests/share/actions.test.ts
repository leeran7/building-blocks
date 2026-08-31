/**
 * AC-26–28 — share-actions builder consumed by ShareRun.
 */

import { describe, expect, it } from "vitest";
import { buildShareActions, buildShareActionsFromTokenUrl } from "../../src/share/actions";
import { buildRecordingSharePayload } from "../../src/share/payload";
import { SHARE_ACTION_LABELS } from "../../src/share/controlLayout";
import { SHARE_FIELD_LIMITS, validateShareFieldLength } from "../../src/share/limits";
import { climbCaption } from "../../src/share/copy";
import { PROD_ORIGIN, sampleRecording } from "./fixtures";

function okPayload() {
  const result = buildRecordingSharePayload(sampleRecording(), PROD_ORIGIN);
  if (!result.ok) throw new Error("fixture payload must be ok");
  return result.data;
}

describe("buildShareActions (AC-26, AC-27, AC-28)", () => {
  it("sets X href to platforms.X.compose.url (AC-26)", () => {
    const payload = okPayload();
    const actions = buildShareActions(payload);
    const x = actions.find((a) => a.id === "X");
    expect(x).toBeDefined();
    if (!x || x.id !== "X") throw new Error("expected X action");
    expect(x.type).toBe("intent");
    if (payload.platforms.X.compose.mode !== "web_intent") {
      throw new Error("expected web_intent compose");
    }
    expect(x.href).toBe(payload.platforms.X.compose.url);
    expect(x.label).toBe(SHARE_ACTION_LABELS.X);
    expect(x.label).toBe("Share on X");
  });

  it("copies TikTok caption and reports UNSUPPORTED_BY_PLATFORM (AC-27)", () => {
    const payload = okPayload();
    const actions = buildShareActions(payload);
    const tiktok = actions.find((a) => a.id === "TIKTOK");
    expect(tiktok).toBeDefined();
    if (!tiktok || tiktok.id !== "TIKTOK") throw new Error("expected TikTok");
    expect(tiktok.type).toBe("copy");
    expect(tiktok.text).toBe(payload.platforms.TIKTOK.caption);
    expect(tiktok.unsupportedReason).toBe("UNSUPPORTED_BY_PLATFORM");
    expect(tiktok.label).toBe("Copy TikTok caption");
  });

  it("copies YouTube title + blank line + description (AC-28)", () => {
    const payload = okPayload();
    const actions = buildShareActions(payload);
    const youtube = actions.find((a) => a.id === "YOUTUBE");
    expect(youtube).toBeDefined();
    if (!youtube || youtube.id !== "YOUTUBE") throw new Error("expected YouTube");
    expect(youtube.type).toBe("copy");
    expect(youtube.text).toBe(
      `${payload.platforms.YOUTUBE.title}\n\n${payload.platforms.YOUTUBE.description}`
    );
    expect(youtube.unsupportedReason).toBe("UNSUPPORTED_BY_PLATFORM");
    expect(youtube.label).toBe("Copy YouTube title and description");
  });
});

describe("buildShareActionsFromTokenUrl", () => {
  it("disables X when a token URL would make the caption exceed 280 (no slice)", () => {
    const tokenUrl = `https://www.doomstack.lol/play?r=${"a".repeat(400)}`;
    const caption = climbCaption(100, tokenUrl);
    expect(
      validateShareFieldLength(caption, SHARE_FIELD_LIMITS.X_CAPTION).valid
    ).toBe(false);
    const actions = buildShareActionsFromTokenUrl(tokenUrl, 100);
    const x = actions.find((a) => a.id === "X");
    if (!x || x.id !== "X") throw new Error("expected X action");
    expect(x.disabled).toBe(true);
    expect(x.href).toBe("");
    expect(x.disabledReason).toBe("VALIDATION_ERROR");
  });
});
