/**
 * Live Satori render — ImageResponse is NOT mocked.
 * Production /api/og 500s today with:
 *   Expected <div> to have explicit "display: flex" or "display: none"
 *   if it has more than one child node.
 * A stubbed ImageResponse cannot catch that. These tests instantiate the
 * real renderer and assert PNG magic bytes.
 */

import { writeFileSync } from "fs";
import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { ImageResponse } from "@vercel/og";
import { ListingOgCard, RecordingOgCard, RecordOgCard } from "../../src/og/card";
import { buildListingOgModel } from "../../src/og/listingModel";
import {
  listingOgImageOptions,
  recordOgImageOptions,
  recordingOgImageOptions,
} from "../../src/og/sizes";

describe("live Satori OG render", () => {
  it("renders listing OG as PNG", async () => {
    await assertPng(
      "listing",
      <ListingOgCard
        {...buildListingOgModel({ name: "Stack", alt: "10.5", rank: "1" })}
      />,
      listingOgImageOptions()
    );
  });

  it("renders recording landscape OG as PNG (with handle)", async () => {
    await assertPng(
      "recording-landscape",
      <RecordingOgCard peakM={142} handle="Maya" />,
      recordingOgImageOptions("landscape")
    );
  });

  it("renders recording square OG as PNG (null handle)", async () => {
    await assertPng(
      "recording-square",
      <RecordingOgCard peakM={8} handle={null} />,
      recordingOgImageOptions("square")
    );
  });

  it("renders record OG as PNG", async () => {
    await assertPng(
      "record",
      <RecordOgCard displayName="Alpha Stack" altitudeM={42} />,
      recordOgImageOptions()
    );
  });
});

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function assertPng(
  name: string,
  element: ReactElement,
  size: { width: number; height: number }
) {
  const image = new ImageResponse(element, size);
  const buf = Buffer.from(await image.arrayBuffer());
  expect(buf.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
  expect(buf.length).toBeGreaterThan(1000);
  if (process.env.DUMP_OG) {
    writeFileSync(`/tmp/og-${name}.png`, buf);
  }
}
