/**
 * GET /r/[id] — canonical climb-recording page.
 * Unique OG/Twitter metadata + JSON-LD WebPage. Playback uses the stored
 * replay token in-place (no 302 to /play?r=).
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveBaseUrl } from "../../../src/config/public";
import { getClimbRunReplayToken, getShareableClimbRun } from "../../../src/db/climb";
import { ClimbPlayClient } from "../../../src/components/Game/ClimbPlayClient";
import { FreeStackShell } from "../../../src/components/FreeStackShell";
import { getRecordingPageMetadata } from "../../../src/seo/recordingMetadata";
import { peakMetres } from "../../../src/share/copy";
import { buildWebPageJsonLd, jsonLdScriptHtml } from "../../../src/share/jsonLd";
import { parseRecordingId } from "../../../src/share/parseRecordingId";
import { buildRecordingCanonicalUrl } from "../../../src/share/urls";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: RecordingPageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await getRecordingPageMetadata(id, resolveBaseUrl());
  if (!result.ok) notFound();
  return result.metadata;
}

export default async function RecordingPage({ params }: RecordingPageProps) {
  const { id } = await params;
  const parsed = parseRecordingId(id);
  if (!parsed) notFound();

  const recording = await getShareableClimbRun(parsed);
  if (!recording) notFound();

  const token = await getClimbRunReplayToken(parsed);
  if (!token) notFound();

  const origin = resolveBaseUrl();
  const peakM = peakMetres(recording.peakY);
  const jsonLd = buildWebPageJsonLd({
    url: buildRecordingCanonicalUrl(origin, recording.id),
    name: `Climbed ${peakM}m on Doomstack`,
    description: `Watch this ${peakM}m climb on Doomstack.`,
  });

  return (
    <FreeStackShell section="play" title="Replay">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScriptHtml(jsonLd) }}
      />
      <ClimbPlayClient replayToken={token} />
    </FreeStackShell>
  );
}

interface RecordingPageProps {
  params: Promise<{ id: string }>;
}
