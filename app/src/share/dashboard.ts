/**
 * Dashboard replay share: canonical `/r/{id}` when a replay token exists.
 * No platform actions and no `/r/{id}` copy when replayToken is null (AC-30).
 */

import { buildShareActions } from "./actions";
import { buildRecordingSharePayload } from "./payload";
import type { DashboardReplay, ShareAction } from "./types";
import { buildRecordingCanonicalUrl } from "./urls";

export function buildDashboardShareUrl(
  origin: string,
  replay: { id: string; replayToken: string | null }
): string | null {
  if (replay.replayToken == null) return null;
  return buildRecordingCanonicalUrl(origin, replay.id);
}

export function buildDashboardShareActions(
  replay: DashboardReplay,
  origin: string
): ShareAction[] {
  if (replay.replayToken == null) return [];
  const result = buildRecordingSharePayload(
    { id: replay.id, peakY: replay.peakY, handle: null },
    origin
  );
  if (!result.ok) return [];
  return buildShareActions(result.data);
}
