/**
 * Pure share-payload builder. Given a loaded recording DTO (or null) and an
 * explicit origin, returns ok:true data or NOT_FOUND / VALIDATION_ERROR.
 * Never slices over-limit strings.
 */

import { SHARE_HASHTAGS, climbCaption, climbTitle, peakMetres, shareCta, TIKTOK_COMPOSE_DETAIL, YOUTUBE_COMPOSE_DETAIL, youtubeDescription } from "./copy";
import { redactShareHandle } from "./handle";
import { SHARE_FIELD_LIMITS, validateShareFieldLength } from "./limits";
import type { PlatformShare, SharePayload, ShareableRecording, ShareToolResult } from "./types";
import { buildRecordingCanonicalUrl, buildRecordingOgImageUrl, buildTweetIntentUrl } from "./urls";

export function buildRecordingSharePayload(
  recording: ShareableRecording | null,
  origin: string
): ShareToolResult<SharePayload> {
  if (!recording) {
    return { ok: false, reason: "NOT_FOUND", detail: "Recording not found" };
  }

  const canonicalUrl = buildRecordingCanonicalUrl(origin, recording.id);
  const imageUrl = buildRecordingOgImageUrl(origin, recording.id, "landscape");
  const imageUrlSquare = buildRecordingOgImageUrl(origin, recording.id, "square");
  const peakM = peakMetres(recording.peakY);
  const handle = redactShareHandle(recording.handle);

  const title = climbTitle(peakM);
  const xCaption = climbCaption(peakM, canonicalUrl);
  const ytDescription = youtubeDescription(peakM, canonicalUrl);
  const cta = shareCta(canonicalUrl);
  const shareHashtags = (): string[] => [...SHARE_HASHTAGS];

  let tiktokCaption = xCaption;
  if (handle) {
    const withHandle = `${xCaption} as ${handle}`;
    if (validateShareFieldLength(withHandle, SHARE_FIELD_LIMITS.TIKTOK_CAPTION).valid) {
      tiktokCaption = withHandle;
    }
  }

  const xLen = validateShareFieldLength(xCaption, SHARE_FIELD_LIMITS.X_CAPTION);
  if (!xLen.valid) {
    return {
      ok: false,
      reason: "VALIDATION_ERROR",
      detail: `X caption length ${xLen.length} exceeds ${xLen.limit}`,
    };
  }
  const tiktokLen = validateShareFieldLength(
    tiktokCaption,
    SHARE_FIELD_LIMITS.TIKTOK_CAPTION
  );
  if (!tiktokLen.valid) {
    return {
      ok: false,
      reason: "VALIDATION_ERROR",
      detail: `TikTok caption length ${tiktokLen.length} exceeds ${tiktokLen.limit}`,
    };
  }
  const ytTitleLen = validateShareFieldLength(title, SHARE_FIELD_LIMITS.YOUTUBE_TITLE);
  if (!ytTitleLen.valid) {
    return {
      ok: false,
      reason: "VALIDATION_ERROR",
      detail: `YouTube title length ${ytTitleLen.length} exceeds ${ytTitleLen.limit}`,
    };
  }
  const ytDescLen = validateShareFieldLength(
    ytDescription,
    SHARE_FIELD_LIMITS.YOUTUBE_DESCRIPTION
  );
  if (!ytDescLen.valid) {
    return {
      ok: false,
      reason: "VALIDATION_ERROR",
      detail: `YouTube description length ${ytDescLen.length} exceeds ${ytDescLen.limit}`,
    };
  }

  const x: PlatformShare = {
    platform: "X",
    contentType: "X_POST",
    title,
    caption: xCaption,
    description: xCaption,
    hashtags: shareHashtags(),
    cta,
    canonicalUrl,
    imageUrl,
    compose: { mode: "web_intent", url: buildTweetIntentUrl(xCaption) },
  };

  const tiktok: PlatformShare = {
    platform: "TIKTOK",
    contentType: "TIKTOK_VIDEO",
    title,
    caption: tiktokCaption,
    description: tiktokCaption,
    hashtags: shareHashtags(),
    cta,
    canonicalUrl,
    imageUrl: imageUrlSquare,
    compose: { mode: "UNSUPPORTED_BY_PLATFORM", detail: TIKTOK_COMPOSE_DETAIL },
  };

  const youtube: PlatformShare = {
    platform: "YOUTUBE",
    contentType: "YOUTUBE_SHORT",
    title,
    caption: xCaption,
    description: ytDescription,
    hashtags: shareHashtags(),
    cta,
    canonicalUrl,
    imageUrl,
    compose: { mode: "UNSUPPORTED_BY_PLATFORM", detail: YOUTUBE_COMPOSE_DETAIL },
  };

  return {
    ok: true,
    data: {
      recordingId: recording.id,
      canonicalUrl,
      imageUrl,
      imageUrlSquare,
      peakY: recording.peakY,
      handle,
      platforms: { X: x, TIKTOK: tiktok, YOUTUBE: youtube },
    },
  };
}
