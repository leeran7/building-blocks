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

export async function markUploadFailed(assetId: string, errorMessage: string): Promise<SocialContentAsset> {
  return prisma.socialContentAsset.update({
    where: { id: assetId },
    data: { status: "FAILED", errorMessage },
  });
}

/** API-response DTO — never includes `platformUploadSessionUri` (redacted like a token). */
export function toPublicAsset(asset: SocialContentAsset) {
  const { platformUploadSessionUri, ...rest } = asset;
  void platformUploadSessionUri;
  return rest;
}
