/**
 * Chunked upload session service (Epic J, ADR-4). Video/image bytes are
 * relayed chunk-by-chunk through our own server — never held in memory
 * across more than one chunk at a time, and the live provider session
 * reference is treated as sensitive (never returned to the browser).
 */

import {
  createUploadSession,
  getUploadSession,
  recordChunkProgress,
  markUploadReady,
  markUploadFailed,
} from "../../db/social/contentAssets";
import { getDecryptedTokens } from "../../db/social/socialAccounts";
import { getContentItemById } from "../../db/social/contentItems";
import { getProvider } from "../providers/registry";
import { errResult, okResult, type ToolResult } from "../types";
import type { SocialAssetKind } from "../types";

export interface InitUploadInput {
  contentItemId: string;
  kind: SocialAssetKind;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export async function initiateContentUpload(input: InitUploadInput): Promise<ToolResult<{ assetId: string; chunkSizeBytes: number }>> {
  const item = await getContentItemById(input.contentItemId);
  if (!item) return errResult("NOT_FOUND", "Content item not found");
  if (!item.socialAccountId) return errResult("VALIDATION_ERROR", "Attach a connected social account to this item first");

  const provider = getProvider(item.platform);
  if (provider.capabilities.uploadMechanism === "NONE") {
    return errResult("UNSUPPORTED_BY_PLATFORM", `${item.platform} does not support asset uploads through this integration yet`);
  }

  const tokens = await getDecryptedTokens(item.socialAccountId);
  if (!tokens) return errResult("REAUTH_REQUIRED", "Connected account needs to be reconnected");

  const initResult = await provider.initiateUpload(tokens.accessToken, {
    kind: input.kind,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    contentType: item.contentType,
  });
  if (!initResult.ok) return initResult;

  const asset = await createUploadSession({
    contentItemId: input.contentItemId,
    kind: input.kind,
    sourceFilename: input.filename,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    chunkSizeBytes: initResult.data.chunkSizeBytes,
    platformUploadSessionUri: initResult.data.providerSessionRef,
  });

  return okResult({ assetId: asset.id, chunkSizeBytes: asset.chunkSizeBytes });
}

export async function relayUploadChunk(
  assetId: string,
  chunk: Buffer,
  rangeStart: number,
  rangeEnd: number,
  totalBytes: number
): Promise<ToolResult<{ complete: boolean; externalAssetId?: string }>> {
  const asset = await getUploadSession(assetId);
  if (!asset) return errResult("NOT_FOUND", "Upload session not found");
  if (asset.status === "READY") return okResult({ complete: true, externalAssetId: asset.externalAssetId ?? undefined });
  if (asset.status === "FAILED") return errResult("VALIDATION_ERROR", "This upload session has already failed — start a new one");

  // Idempotent: re-PUTting an already-committed byte range is a no-op.
  if (rangeStart < asset.bytesUploaded) {
    return okResult({ complete: false });
  }

  const item = await getContentItemById(asset.contentItemId);
  if (!item?.socialAccountId) return errResult("NOT_FOUND", "Content item or social account not found");
  const tokens = await getDecryptedTokens(item.socialAccountId);
  if (!tokens) return errResult("REAUTH_REQUIRED", "Connected account needs to be reconnected");

  const provider = getProvider(item.platform);
  if (!asset.platformUploadSessionUri) return errResult("VALIDATION_ERROR", "Upload session missing provider reference");

  const result = await provider.relayChunk(
    tokens.accessToken,
    { chunkSizeBytes: asset.chunkSizeBytes, providerSessionRef: asset.platformUploadSessionUri },
    chunk,
    rangeStart,
    rangeEnd,
    totalBytes
  );

  if (!result.ok) {
    await markUploadFailed(assetId, result.detail);
    return result;
  }

  await recordChunkProgress(assetId, rangeEnd + 1);

  if (result.data.complete && result.data.externalAssetId) {
    await markUploadReady(assetId, result.data.externalAssetId);
  }

  return okResult(result.data);
}
