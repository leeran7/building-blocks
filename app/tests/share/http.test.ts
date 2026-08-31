/**
 * GET /api/share/recording/[id] — HTTP caller of buildRecordingSharePayload.
 * AC-12/15 HTTP half: {ok:true,data} vs {error,code:NOT_FOUND}.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, degraded: false })),
  clientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("../../src/db/climb", () => ({
  getShareableClimbRun: vi.fn(),
}));

import { GET } from "../../app/api/share/recording/[id]/route";
import { getShareableClimbRun } from "../../src/db/climb";
import { sampleRecording } from "./fixtures";

async function getShare(id: string): Promise<Response> {
  return GET(new NextRequest(`http://localhost/api/share/recording/${id}`), {
    params: Promise.resolve({ id }),
  });
}

describe("GET /api/share/recording/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BASE_URL = "https://www.doomstack.lol";
  });

  it("returns {ok:true,data} for a shareable recording", async () => {
    vi.mocked(getShareableClimbRun).mockResolvedValue(sampleRecording());
    const res = await getShare("rec_test_1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok?: boolean;
      data?: { recordingId?: string; platforms?: unknown };
    };
    expect(body.ok).toBe(true);
    expect(body.data?.recordingId).toBe("rec_test_1");
    expect(body.data?.platforms).toBeDefined();
    const json = JSON.stringify(body.data);
    expect(json).not.toContain("replay_token");
    expect(json).not.toContain("replayToken");
    expect(json).not.toContain("INTERNAL_TOKEN");
  });

  it("returns {error,code:NOT_FOUND} when the recording is missing (AC-15)", async () => {
    vi.mocked(getShareableClimbRun).mockResolvedValue(null);
    const res = await getShare("rec_missing");
    expect(res.status).toBe(404);
    const body = (await res.json()) as {
      error?: string;
      code?: string;
      ok?: boolean;
      data?: unknown;
    };
    expect(body.code).toBe("NOT_FOUND");
    expect(typeof body.error).toBe("string");
    expect(body.ok).not.toBe(true);
    expect(body.data).toBeUndefined();
  });
});
