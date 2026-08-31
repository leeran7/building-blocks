/**
 * Shared recording OG handler (landscape + square). Node + Prisma; 404 on
 * unknown/invalid/no-token ids — never the listing homepage card.
 */

import { ImageResponse } from "@vercel/og";
import { NextResponse } from "next/server";
import { getShareableClimbRun } from "../db/climb";
import { peakMetres } from "../share/copy";
import type { OgVariant } from "../share/types";
import { RecordingOgCard } from "./card";
import { ogPngResponse } from "./respond";
import { RECORDING_OG_CACHE_CONTROL, recordingOgImageOptions } from "./sizes";

export async function serveRecordingOg(
  rawId: string,
  variant: OgVariant
): Promise<Response> {
  const recording = await getShareableClimbRun(rawId);
  if (!recording) {
    return NextResponse.json(
      { error: "Recording not found", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  try {
    const size = recordingOgImageOptions(variant);
    const image = new ImageResponse(
      <RecordingOgCard
        peakM={peakMetres(recording.peakY)}
        handle={recording.handle}
      />,
      size
    );
    return ogPngResponse(image, RECORDING_OG_CACHE_CONTROL);
  } catch {
    return NextResponse.json(
      { error: "Failed to generate OG image", code: "OG_RENDER_FAILED" },
      { status: 500 }
    );
  }
}
