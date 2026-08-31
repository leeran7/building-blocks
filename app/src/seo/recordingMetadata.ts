/**
 * Per-recording generateMetadata helper. Returns NOT_FOUND rather than
 * calling notFound() so tests can invoke it. Pages call notFound() on !ok.
 * Must not decode replay_token.
 */

import type { Metadata } from "next";
import { getShareableClimbRun } from "../db/climb";
import { peakMetres } from "../share/copy";
import { buildRecordingCanonicalUrl, buildRecordingOgImageUrl } from "../share/urls";

export type RecordingMetadataResult =
  | { ok: true; metadata: Metadata }
  | { ok: false; reason: "NOT_FOUND" };

export async function getRecordingPageMetadata(
  id: string,
  origin: string
): Promise<RecordingMetadataResult> {
  const recording = await getShareableClimbRun(id);
  if (!recording) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  const peakM = peakMetres(recording.peakY);
  const peakLabel = String(peakM);
  const canonical = buildRecordingCanonicalUrl(origin, recording.id);
  const image = buildRecordingOgImageUrl(origin, recording.id, "landscape");
  const title = `Climbed ${peakLabel}m on Doomstack`;
  const description = `Watch this ${peakLabel}m climb on Doomstack.`;

  const metadata: Metadata = {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };

  return { ok: true, metadata };
}
