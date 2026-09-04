/**
 * ContentAsset data access (Epic J — chunked video/image upload sessions).
 */

import { prisma } from "../client";
import type { SocialContentAsset } from "@prisma/client";
import type { SocialAssetKind } from "../../social/types";

export async function createUploadSession(input: {
  contentItemId: string;
  kind: SocialAssetKind;
  sourceFilename?: string | null;
  mimeType: string;
  sizeBytes: number;
  chunkSizeBytes: number;
  platformUploadSessionUri?: string | null;
}): Promise<SocialContentAsset> {
  return prisma.socialContentAsset.create({
    data: {
      contentItemId: input.contentItemId,
      kind: input.kind,
      status: "UPLOADING",
      sourceFilename: input.sourceFilename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      chunkSizeBytes: input.chunkSizeBytes,
      platformUploadSessionUri: input.platformUploadSessionUri,
    },
  });
}

export async function createAiVideoAsset(input: {
  contentItemId: string;
  aiVideoJobId: string;
  mimeType: string;
}): Promise<SocialContentAsset> {
  return prisma.socialContentAsset.create({
    data: {
      contentItemId: input.contentItemId,
      kind: "VIDEO",
      status: "GENERATING",
      mimeType: input.mimeType,
      sizeBytes: 0,
      chunkSizeBytes: 0,
      aiVideoJobId: input.aiVideoJobId,
    },
  });
}

export async function getUploadSession(assetId: string): Promise<SocialContentAsset | null> {
  return prisma.socialContentAsset.findUnique({ where: { id: assetId } });
}

export async function recordChunkProgress(
  assetId: string,
  bytesUploaded: number
): Promise<SocialContentAsset> {
  return prisma.socialContentAsset.update({
    where: { id: assetId },
    data: { bytesUploaded },
  });
}

export async function markUploadReady(
  assetId: string,
  externalAssetId: string
): Promise<SocialContentAsset> {
  return prisma.socialContentAsset.update({
    where: { id: assetId },
    data: { status: "READY", externalAssetId },
  });
}

export async function markVideoGenerationReady(
  assetId: string,
  storedVideoUrl: string,
  sizeBytes: number
): Promise<SocialContentAsset> {
  return prisma.socialContentAsset.update({
    where: { id: assetId },
    data: { status: "READY", storedVideoUrl, sizeBytes },
  });
}

export async function markUploadFailed(assetId: string, errorMessage: string): Promise<SocialContentAsset> {
  return prisma.socialContentAsset.update({
    where: { id: assetId },
    data: { status: "FAILED", errorMessage },
  });
}

export async function getLatestReadyAssetForContentItem(
  contentItemId: string
): Promise<SocialContentAsset | null> {
  return prisma.socialContentAsset.findFirst({
    where: {
      contentItemId,
      status: "READY",
      externalAssetId: { not: null },
    },
    orderBy: { updatedAt: "desc" },
  });
}

/** API-response DTO — never includes `platformUploadSessionUri` (redacted like a token). */
export function toPublicAsset(asset: SocialContentAsset) {
  const { platformUploadSessionUri, aiVideoJobId, ...rest } = asset;
  void platformUploadSessionUri;
  void aiVideoJobId;
  return rest;
}
