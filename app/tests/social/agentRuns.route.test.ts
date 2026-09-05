/**
 * POST /api/social/agent/runs and POST /api/social/agent/runs/:id/step are
 * the production callers of createChatRun()/runNextChatStep() and the only
 * places the JSON `error` field is assembled for the client. Per the
 * implementer's 2026-09-04 handoff: `error: result.run.status === "FAILED"
 * ? result.run.error : undefined` previously always evaluated to undefined
 * at runtime (git-blame'd latent bug) even though agent/page.tsx already
 * read it — this is the load-bearing contract the redesigned AI Assistant
 * error banner (design.md §5.2) depends on, and it had zero coverage.
 *
 * These tests invoke the real route handlers (not a re-implementation of
 * the field-selection logic) and assert the response body.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SocialAgentRun, SocialAgentTask } from "@prisma/client";

vi.mock("../../src/lib/firebaseAdmin", () => ({
  verifyIdToken: vi.fn(),
}));

vi.mock("../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, degraded: false })),
  clientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("../../src/social/agent/chatRunner", () => ({
  createChatRun: vi.fn(),
  runNextChatStep: vi.fn(),
}));

vi.mock("../../src/db/social/agentRuns", () => ({
  getAgentRun: vi.fn(),
}));

import { verifyIdToken } from "../../src/lib/firebaseAdmin";
import { createChatRun, runNextChatStep } from "../../src/social/agent/chatRunner";
import { getAgentRun } from "../../src/db/social/agentRuns";
import { POST as postRun } from "../../app/api/social/agent/runs/route";
import { POST as postStep } from "../../app/api/social/agent/runs/[id]/step/route";

const ADMIN_UID = "admin-uid-1";

function baseRun(overrides: Partial<SocialAgentRun> = {}): SocialAgentRun {
  return {
    id: "run-1",
    kind: "CHAT_TURN",
    status: "SUCCEEDED",
    initiatedByUid: ADMIN_UID,
    initiatedBySystem: null,
    input: { message: "hello" },
    isoWeek: null,
    currentStepIndex: 1,
    maxSteps: 12,
    lockedAt: null,
    error: null,
    startedAt: new Date(),
    finishedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as SocialAgentRun;
}

function baseTask(overrides: Partial<SocialAgentTask> = {}): SocialAgentTask {
  return {
    id: "task-1",
    agentRunId: "run-1",
    stepIndex: 0,
    toolName: null,
    contentItemId: null,
    input: null,
    outputSanitized: null,
    status: "SUCCEEDED",
    errorMessage: null,
    startedAt: new Date(),
    finishedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  } as SocialAgentTask;
}

function authedRequest(url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer valid-token",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("POST /api/social/agent/runs — run.error contract", () => {
  const origUids = process.env.ADMIN_UIDS;
  const origEmails = process.env.ADMIN_EMAILS;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_UIDS = ADMIN_UID;
    process.env.ADMIN_EMAILS = "";
    vi.mocked(verifyIdToken).mockResolvedValue({
      uid: ADMIN_UID,
      email: "admin@example.com",
    } as Awaited<ReturnType<typeof verifyIdToken>>);
  });

  afterEach(() => {
    process.env.ADMIN_UIDS = origUids;
    process.env.ADMIN_EMAILS = origEmails;
  });

  it("returns a non-empty error string when the run ends FAILED", async () => {
    vi.mocked(createChatRun).mockResolvedValue({
      run: baseRun({ status: "FAILED", error: "Maximum step count exceeded" }),
      task: null,
    });

    const res = await postRun(
      authedRequest("http://localhost/api/social/agent/runs", {
        kind: "CHAT_TURN",
        message: "paste this replay",
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status?: string; error?: string };
    expect(body.status).toBe("FAILED");
    expect(typeof body.error).toBe("string");
    expect(body.error).toBe("Maximum step count exceeded");
    expect(body.error!.length).toBeGreaterThan(0);
  });

  it("omits error (undefined) when the run SUCCEEDED", async () => {
    vi.mocked(createChatRun).mockResolvedValue({
      run: baseRun({ status: "SUCCEEDED", error: null }),
      task: baseTask(),
      assistantText: "Here are your drafts.",
    });

    const res = await postRun(
      authedRequest("http://localhost/api/social/agent/runs", {
        kind: "CHAT_TURN",
        message: "make me a draft",
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status?: string; error?: unknown };
    expect(body.status).toBe("SUCCEEDED");
    expect(body.error).toBeUndefined();
  });

  it("rejects a non-CHAT_TURN kind with 400 VALIDATION_ERROR", async () => {
    const res = await postRun(
      authedRequest("http://localhost/api/social/agent/runs", {
        kind: "WEEKLY_STRATEGY",
        message: "hi",
      })
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(createChatRun).not.toHaveBeenCalled();
  });

  it("rejects a missing message with 400 VALIDATION_ERROR", async () => {
    const res = await postRun(
      authedRequest("http://localhost/api/social/agent/runs", { kind: "CHAT_TURN" })
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects invalid JSON with 400 VALIDATION_ERROR", async () => {
    const res = await postRun(
      new NextRequest("http://localhost/api/social/agent/runs", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer valid-token" },
        body: "{not json",
      })
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 when no Authorization header is present", async () => {
    const res = await postRun(
      new NextRequest("http://localhost/api/social/agent/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "CHAT_TURN", message: "hi" }),
      })
    );
    expect(res.status).toBe(401);
    expect(createChatRun).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is authenticated but not on the social-admin allowlist", async () => {
    process.env.ADMIN_UIDS = "someone-else";
    process.env.ADMIN_EMAILS = "";
    const res = await postRun(
      authedRequest("http://localhost/api/social/agent/runs", {
        kind: "CHAT_TURN",
        message: "hi",
      })
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("NOT_SOCIAL_ADMIN");
    expect(createChatRun).not.toHaveBeenCalled();
  });
});

describe("POST /api/social/agent/runs/:id/step — run.error contract", () => {
  const origUids = process.env.ADMIN_UIDS;
  const origEmails = process.env.ADMIN_EMAILS;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_UIDS = ADMIN_UID;
    process.env.ADMIN_EMAILS = "";
    vi.mocked(verifyIdToken).mockResolvedValue({
      uid: ADMIN_UID,
      email: "admin@example.com",
    } as Awaited<ReturnType<typeof verifyIdToken>>);
  });

  afterEach(() => {
    process.env.ADMIN_UIDS = origUids;
    process.env.ADMIN_EMAILS = origEmails;
  });

  async function stepRequest(id: string) {
    return postStep(authedRequest(`http://localhost/api/social/agent/runs/${id}/step`), {
      params: Promise.resolve({ id }),
    });
  }

  it("returns a non-empty error string when a stepped run ends FAILED", async () => {
    vi.mocked(getAgentRun).mockResolvedValue(baseRun({ status: "WAITING_ON_STEP" }));
    vi.mocked(runNextChatStep).mockResolvedValue({
      run: baseRun({ status: "FAILED", error: "Tool dispatch threw: platform error" }),
      task: null,
    });

    const res = await stepRequest("run-1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status?: string; error?: string };
    expect(body.status).toBe("FAILED");
    expect(typeof body.error).toBe("string");
    expect(body.error).toBe("Tool dispatch threw: platform error");
  });

  it("omits error when the stepped run is still WAITING_ON_STEP", async () => {
    vi.mocked(getAgentRun).mockResolvedValue(baseRun({ status: "WAITING_ON_STEP" }));
    vi.mocked(runNextChatStep).mockResolvedValue({
      run: baseRun({ status: "WAITING_ON_STEP", error: null }),
      task: baseTask({ status: "SUCCEEDED" }),
    });

    const res = await stepRequest("run-1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status?: string; error?: unknown };
    expect(body.status).toBe("WAITING_ON_STEP");
    expect(body.error).toBeUndefined();
  });

  it("returns 404 when the run does not exist", async () => {
    vi.mocked(getAgentRun).mockResolvedValue(null);
    const res = await stepRequest("missing-run");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("NOT_FOUND");
    expect(runNextChatStep).not.toHaveBeenCalled();
  });

  it("returns 403 when the run was initiated by a different uid", async () => {
    vi.mocked(getAgentRun).mockResolvedValue(baseRun({ initiatedByUid: "someone-else-uid" }));
    const res = await stepRequest("run-1");
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("FORBIDDEN");
    expect(runNextChatStep).not.toHaveBeenCalled();
  });

  it("returns 400 when the run is not a CHAT_TURN kind", async () => {
    vi.mocked(getAgentRun).mockResolvedValue(baseRun({ kind: "WEEKLY_STRATEGY" }));
    const res = await stepRequest("run-1");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(runNextChatStep).not.toHaveBeenCalled();
  });

  it("returns 401 when no Authorization header is present", async () => {
    const res = await postStep(
      new NextRequest("http://localhost/api/social/agent/runs/run-1/step", {
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "run-1" }) }
    );
    expect(res.status).toBe(401);
    expect(getAgentRun).not.toHaveBeenCalled();
  });
});
