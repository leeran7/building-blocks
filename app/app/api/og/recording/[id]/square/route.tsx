/**
 * GET /api/og/recording/[id]/square — 1080×1080 TikTok preview variant.
 */

import { serveRecordingOg } from "../../../../../../src/og/recordingServe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  return serveRecordingOg(id, "square");
}
