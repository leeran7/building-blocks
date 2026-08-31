/**
 * AC-31 — 44×44 named share controls via layout helper + ShareControls markup.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  SHARE_ACTION_LABELS,
  SHARE_CONTROL_LAYOUT,
} from "../../src/share/controlLayout";
import { buildShareActions } from "../../src/share/actions";
import { buildRecordingSharePayload } from "../../src/share/payload";
import { ShareControls } from "../../src/components/Game/ShareControls";
import { PROD_ORIGIN, sampleRecording } from "./fixtures";

describe("SHARE_CONTROL_LAYOUT and SHARE_ACTION_LABELS (AC-31)", () => {
  it("requires a 44×44 hit target", () => {
    expect(SHARE_CONTROL_LAYOUT.minHeightPx).toBe(44);
    expect(SHARE_CONTROL_LAYOUT.minWidthPx).toBe(44);
    expect(SHARE_CONTROL_LAYOUT.className).toContain("min-h-[44px]");
    expect(SHARE_CONTROL_LAYOUT.className).toContain("min-w-[44px]");
  });

  it("exports the exact accessible names", () => {
    expect(SHARE_ACTION_LABELS.X).toBe("Share on X");
    expect(SHARE_ACTION_LABELS.TIKTOK).toBe("Copy TikTok caption");
    expect(SHARE_ACTION_LABELS.YOUTUBE).toBe(
      "Copy YouTube title and description"
    );
    expect(SHARE_ACTION_LABELS.COPY_LINK).toBe("Copy link");
  });
});

describe("ShareControls markup (AC-31)", () => {
  it("renders named <a>/<button> controls with min-h-[44px] and no tabIndex=-1", () => {
    const payload = buildRecordingSharePayload(sampleRecording(), PROD_ORIGIN);
    if (!payload.ok) throw new Error("fixture payload must be ok");
    const html = renderToStaticMarkup(
      createElement(ShareControls, {
        actions: buildShareActions(payload.data),
        onToast: () => undefined,
      })
    );
    expect(html).toContain("min-h-[44px]");
    expect(html).toContain("min-w-[44px]");
    expect(html).toContain('aria-label="Share on X"');
    expect(html).toContain('aria-label="Copy TikTok caption"');
    expect(html).toContain('aria-label="Copy YouTube title and description"');
    expect(html).toContain('aria-label="Copy link"');
    expect(html).toContain("<a ");
    expect(html).toContain("<button");
    expect(html).not.toContain('tabindex="-1"');
    expect(html).not.toContain("pointer-events: none");
    expect(html).not.toContain("pointer-events:none");
  });
});
