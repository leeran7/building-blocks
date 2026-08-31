/**
 * GET /api/og/recording/[id] — landscape 1200×630 recording card.
 * Node runtime (Prisma lookup). Unknown id → 404 JSON, not listing art.
 */

import { serveRecordingOg } from "../../../../../src/og/recordingServe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  return serveRecordingOg(id, "landscape");
}
