/**
 * Runway Gen-4.5 (text-to-video) generation for social content items.
 * Jobs are async — start here, then poll refreshVideoGenerationStatus().
 */

import { prisma } from "../../db/client";
import {
  createAiVideoAsset,
  getUploadSession,
  markUploadFailed,
  markVideoGenerationReady,
} from "../../db/social/contentAssets";
import { getContentItemById } from "../../db/social/contentItems";
import { errResult, okResult, type ToolResult } from "../types";
import type { SocialPlatform } from "../types";
import type { SocialContentAsset } from "@prisma/client";

const RUNWAY_BASE_URL = "https://api.dev.runwayml.com/v1";
const RUNWAY_API_VERSION = "2024-11-06";

const VIDEO_PLATFORMS = new Set<SocialPlatform>(["TIKTOK", "YOUTUBE"]);

function runwayKey(): string {
  const key = process.env.RUNWAY_API_KEY;
  if (!key) throw new Error("RUNWAY_API_KEY is not configured");
  return key;
}

function videoModel(): string {
  return process.env.AI_VIDEO_MODEL || "gen4.5";
}

function videoRatioForPlatform(_platform: SocialPlatform): string {
  // Gen-4.5 text-to-video tops out at 720p; portrait fits both TikTok and YouTube Shorts.
  return "720:1280";
}

function videoSeconds(): number {
  return Number(process.env.AI_VIDEO_SECONDS) || 8;
}

function isVideoContent(platform: SocialPlatform, contentType: string): boolean {
  if (platform === "TIKTOK") return true;
  if (platform === "YOUTUBE" && contentType === "YOUTUBE_SHORT") return true;
  return false;
}

function buildVideoPrompt(input: {
  prompt: string;
  hook?: string | null;
  script?: string | null;
  visualDirection?: string | null;
  platform: SocialPlatform;
}): string {
  const parts = [
    `Create a short vertical social video for ${input.platform}.`,
    input.prompt,
    input.hook ? `Hook: ${input.hook}` : "",
    input.script ? `Spoken script / action: ${input.script}` : "",
    input.visualDirection ? `Visual direction: ${input.visualDirection}` : "",
    "Cinematic lighting, smooth camera motion, no on-screen text unless essential.",
  ];
  return parts.filter(Boolean).join("\n");
}

type RunwayTaskStatus = "PENDING" | "THROTTLED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

interface RunwayTask {
  id: string;
  status: RunwayTaskStatus;
  output?: string[];
  failure?: string;
  failureCode?: string;
}

async function runwayFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${RUNWAY_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${runwayKey()}`,
      "X-Runway-Version": RUNWAY_API_VERSION,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function createRunwayVideoTask(prompt: string, platform: SocialPlatform): Promise<{ id: string }> {
  const res = await runwayFetch("/text_to_video", {
    method: "POST",
    body: JSON.stringify({
      model: videoModel(),
      promptText: prompt,
      ratio: videoRatioForPlatform(platform),
      duration: videoSeconds(),
    }),
  });
  const data = (await res.json()) as { id?: string; error?: string };
  if (!res.ok || !data.id) {
    throw new Error(data.error ?? `Runway video create failed (${res.status})`);
  }
  return { id: data.id };
}

async function getRunwayVideoTask(taskId: string): Promise<RunwayTask> {
  const res = await runwayFetch(`/tasks/${taskId}`);
  const data = (await res.json()) as RunwayTask & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Runway video status failed (${res.status})`);
  }
  return data;
}

async function downloadRunwayVideo(videoUrl: string): Promise<Buffer> {
  const res = await fetch(videoUrl);
  if (!res.ok) {
    throw new Error(`Runway video download failed (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function persistVideoBytes(contentItemId: string, assetId: string, bytes: Buffer): Promise<string> {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (blobToken) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`social-videos/${contentItemId}/${assetId}.mp4`, bytes, {
      access: "public",
      contentType: "video/mp4",
      token: blobToken,
    });
    return blob.url;
  }

  // Fallback: store under /tmp and serve via our API proxy route.
  const { mkdir, writeFile } = await import("fs/promises");
  const { join } = await import("path");
  const dir = join("/tmp", "social-videos", contentItemId);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${assetId}.mp4`);
  await writeFile(filePath, bytes);
  return `/api/social/content/${contentItemId}/video?assetId=${assetId}`;
}

export function isVideoGenerationConfigured(): boolean {
  return !!process.env.RUNWAY_API_KEY;
}

export async function startVideoGenerationForContentItem(
  contentItemId: string
): Promise<ToolResult<{ assetId: string; jobId: string }>> {
  if (!isVideoGenerationConfigured()) {
    return errResult("VALIDATION_ERROR", "RUNWAY_API_KEY is not configured — video generation is unavailable");
  }

  const item = await getContentItemById(contentItemId);
  if (!item) return errResult("NOT_FOUND", "Content item not found");
  if (!VIDEO_PLATFORMS.has(item.platform) || !isVideoContent(item.platform, item.contentType)) {
    return errResult("UNSUPPORTED_BY_PLATFORM", `${item.platform} ${item.contentType} does not support AI video generation`);
  }

  const existing = await prisma.socialContentAsset.findFirst({
    where: {
      contentItemId,
      status: { in: ["GENERATING", "READY"] },
      kind: "VIDEO",
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing?.status === "GENERATING") {
    return okResult({ assetId: existing.id, jobId: existing.aiVideoJobId ?? "" });
  }
  if (existing?.status === "READY" && existing.storedVideoUrl) {
    return okResult({ assetId: existing.id, jobId: existing.aiVideoJobId ?? "" });
  }

  const videoPrompt = buildVideoPrompt({
    prompt: item.prompt ?? item.title ?? "Social media video",
    hook: item.hook,
    script: item.script,
    visualDirection: item.visualDirection,
    platform: item.platform,
  });

  let job: { id: string };
  try {
    job = await createRunwayVideoTask(videoPrompt, item.platform);
  } catch (err) {
    return errResult("PLATFORM_ERROR", (err as Error).message);
  }

  const asset = await createAiVideoAsset({
    contentItemId,
    aiVideoJobId: job.id,
    mimeType: "video/mp4",
  });

  return okResult({ assetId: asset.id, jobId: job.id });
}

export interface VideoGenerationStatus {
  assetId: string;
  status: SocialContentAsset["status"];
  jobStatus?: string;
  videoUrl?: string;
  errorMessage?: string | null;
}

export async function refreshVideoGenerationStatus(
  contentItemId: string,
  assetId?: string
): Promise<ToolResult<VideoGenerationStatus>> {
  const asset = assetId
    ? await getUploadSession(assetId)
    : await prisma.socialContentAsset.findFirst({
        where: { contentItemId, kind: "VIDEO" },
        orderBy: { createdAt: "desc" },
      });

  if (!asset || asset.contentItemId !== contentItemId) {
    return errResult("NOT_FOUND", "Video asset not found");
  }

  if (asset.status === "READY" && asset.storedVideoUrl) {
    return okResult({
      assetId: asset.id,
      status: asset.status,
      jobStatus: "completed",
      videoUrl: asset.storedVideoUrl,
    });
  }

  if (asset.status === "FAILED") {
    return okResult({
      assetId: asset.id,
      status: asset.status,
      errorMessage: asset.errorMessage,
    });
  }

  if (!asset.aiVideoJobId) {
    return errResult("VALIDATION_ERROR", "Video asset has no video job id");
  }

  let job: RunwayTask;
  try {
    job = await getRunwayVideoTask(asset.aiVideoJobId);
  } catch (err) {
    return errResult("PLATFORM_ERROR", (err as Error).message);
  }

  if (job.status === "FAILED" || job.status === "CANCELLED") {
    const message = job.failure ?? "Video generation failed";
    await markUploadFailed(asset.id, message);
    return okResult({
      assetId: asset.id,
      status: "FAILED",
      jobStatus: job.status,
      errorMessage: message,
    });
  }

  const videoUrl = job.status === "SUCCEEDED" ? job.output?.[0] : undefined;
  if (job.status !== "SUCCEEDED" || !videoUrl) {
    return okResult({
      assetId: asset.id,
      status: "GENERATING",
      jobStatus: job.status,
    });
  }

  try {
    const bytes = await downloadRunwayVideo(videoUrl);
    const storedUrl = await persistVideoBytes(contentItemId, asset.id, bytes);
    const updated = await markVideoGenerationReady(asset.id, storedUrl, bytes.length);
    return okResult({
      assetId: updated.id,
      status: updated.status,
      jobStatus: job.status,
      videoUrl: updated.storedVideoUrl ?? storedUrl,
    });
  } catch (err) {
    const message = (err as Error).message;
    await markUploadFailed(asset.id, message);
    return okResult({
      assetId: asset.id,
      status: "FAILED",
      jobStatus: job.status,
      errorMessage: message,
    });
  }
}

export async function startVideosForContentItems(
  itemIds: string[]
): Promise<Array<{ contentItemId: string; assetId?: string; error?: string }>> {
  const results: Array<{ contentItemId: string; assetId?: string; error?: string }> = [];
  for (const id of itemIds) {
    const started = await startVideoGenerationForContentItem(id);
    if (started.ok) {
      results.push({ contentItemId: id, assetId: started.data.assetId });
    } else {
      results.push({ contentItemId: id, error: started.detail });
    }
  }
  return results;
}

export async function readStoredVideoFile(
  contentItemId: string,
  assetId: string
): Promise<Buffer | null> {
  const { readFile } = await import("fs/promises");
  const { join } = await import("path");
  const filePath = join("/tmp", "social-videos", contentItemId, `${assetId}.mp4`);
  try {
    return await readFile(filePath);
  } catch {
    return null;
  }
}
