/**
 * Human share actions for ShareRun. Consumes the same payload Atlas uses.
 */

import { climbCaption, climbTitle, peakMetres, youtubeDescription } from "./copy";
import { SHARE_ACTION_LABELS } from "./controlLayout";
import { SHARE_FIELD_LIMITS, validateShareFieldLength } from "./limits";
import type { ShareAction, SharePayload } from "./types";
import { buildTweetIntentUrl } from "./urls";

export function buildShareActions(payload: SharePayload): ShareAction[] {
  const x = payload.platforms.X;
  const tiktok = payload.platforms.TIKTOK;
  const youtube = payload.platforms.YOUTUBE;

  const xHref = x.compose.mode === "web_intent" ? x.compose.url : "";

  const xAction: ShareAction =
    x.compose.mode === "web_intent"
      ? {
          id: "X",
          type: "intent",
          href: xHref,
          label: SHARE_ACTION_LABELS.X,
        }
      : {
          id: "X",
          type: "intent",
          href: "",
          label: SHARE_ACTION_LABELS.X,
          disabled: true,
          disabledReason: "UNSUPPORTED_BY_PLATFORM",
        };

  return [
    xAction,
    {
      id: "TIKTOK",
      type: "copy",
      text: tiktok.caption,
      unsupportedReason: "UNSUPPORTED_BY_PLATFORM",
      label: SHARE_ACTION_LABELS.TIKTOK,
    },
    {
      id: "YOUTUBE",
      type: "copy",
      text: `${youtube.title}\n\n${youtube.description}`,
      unsupportedReason: "UNSUPPORTED_BY_PLATFORM",
      label: SHARE_ACTION_LABELS.YOUTUBE,
    },
    {
      id: "COPY_LINK",
      type: "copy",
      text: payload.canonicalUrl,
      label: SHARE_ACTION_LABELS.COPY_LINK,
    },
  ];
}

/**
 * Token-only share (anonymous / unsaved). X is disabled when the caption
 * would exceed 280 — never truncated. TikTok/YouTube copy is disabled when
 * the matching field would overflow.
 */
export function buildShareActionsFromTokenUrl(
  tokenUrl: string,
  peakY: number
): ShareAction[] {
  const peakM = peakMetres(peakY);
  const title = climbTitle(peakM);
  const caption = climbCaption(peakM, tokenUrl);
  const ytDesc = youtubeDescription(peakM, tokenUrl);

  const xOk = validateShareFieldLength(caption, SHARE_FIELD_LIMITS.X_CAPTION);
  const tiktokOk = validateShareFieldLength(
    caption,
    SHARE_FIELD_LIMITS.TIKTOK_CAPTION
  );
  const ytTitleOk = validateShareFieldLength(title, SHARE_FIELD_LIMITS.YOUTUBE_TITLE);
  const ytDescOk = validateShareFieldLength(
    ytDesc,
    SHARE_FIELD_LIMITS.YOUTUBE_DESCRIPTION
  );

  const xAction: ShareAction = xOk.valid
    ? {
        id: "X",
        type: "intent",
        href: buildTweetIntentUrl(caption),
        label: SHARE_ACTION_LABELS.X,
      }
    : {
        id: "X",
        type: "intent",
        href: "",
        label: SHARE_ACTION_LABELS.X,
        disabled: true,
        disabledReason: "VALIDATION_ERROR",
      };

  return [
    xAction,
    {
      id: "TIKTOK",
      type: "copy",
      text: tiktokOk.valid ? caption : "",
      unsupportedReason: "UNSUPPORTED_BY_PLATFORM",
      label: SHARE_ACTION_LABELS.TIKTOK,
      disabled: !tiktokOk.valid,
      disabledReason: tiktokOk.valid ? undefined : "VALIDATION_ERROR",
    },
    {
      id: "YOUTUBE",
      type: "copy",
      text:
        ytTitleOk.valid && ytDescOk.valid ? `${title}\n\n${ytDesc}` : "",
      unsupportedReason: "UNSUPPORTED_BY_PLATFORM",
      label: SHARE_ACTION_LABELS.YOUTUBE,
      disabled: !(ytTitleOk.valid && ytDescOk.valid),
      disabledReason:
        ytTitleOk.valid && ytDescOk.valid ? undefined : "VALIDATION_ERROR",
    },
    {
      id: "COPY_LINK",
      type: "copy",
      text: tokenUrl,
      label: SHARE_ACTION_LABELS.COPY_LINK,
    },
  ];
}
