/**
 * Standalone share-payload contract for climb recordings.
 *
 * Field names align with the unmerged marketing agent (PR #11) so that agent
 * can consume JSON later. This module must not import `src/social/*`.
 */

export type SharePlatform = "X" | "TIKTOK" | "YOUTUBE";

export type ShareContentType = "X_POST" | "TIKTOK_VIDEO" | "YOUTUBE_SHORT";

export type ComposeMode = "web_intent" | "UNSUPPORTED_BY_PLATFORM";

export type ShareFailReason = "NOT_FOUND" | "VALIDATION_ERROR";

export type OgVariant = "landscape" | "square";

export type ShareToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "NOT_FOUND"; detail: string }
  | { ok: false; reason: "VALIDATION_ERROR"; detail: string };

export interface ShareableRecording {
  id: string;
  peakY: number;
  handle: string | null;
}

export type ComposeSpec =
  | { mode: "web_intent"; url: string }
  | { mode: "UNSUPPORTED_BY_PLATFORM"; detail: string };

export interface PlatformShare {
  platform: SharePlatform;
  contentType: ShareContentType;
  title: string;
  caption: string;
  description: string;
  hashtags: string[];
  cta: string;
  canonicalUrl: string;
  imageUrl: string;
  compose: ComposeSpec;
}

export interface SharePayload {
  recordingId: string;
  canonicalUrl: string;
  imageUrl: string;
  imageUrlSquare: string;
  peakY: number;
  handle: string | null;
  platforms: {
    X: PlatformShare;
    TIKTOK: PlatformShare;
    YOUTUBE: PlatformShare;
  };
}

export type ShareAction =
  | {
      id: "X";
      type: "intent";
      href: string;
      label: "Share on X";
      disabled?: boolean;
      disabledReason?: string;
    }
  | {
      id: "TIKTOK";
      type: "copy";
      text: string;
      unsupportedReason: "UNSUPPORTED_BY_PLATFORM";
      label: "Copy TikTok caption";
      disabled?: boolean;
      disabledReason?: string;
    }
  | {
      id: "YOUTUBE";
      type: "copy";
      text: string;
      unsupportedReason: "UNSUPPORTED_BY_PLATFORM";
      label: "Copy YouTube title and description";
      disabled?: boolean;
      disabledReason?: string;
    }
  | {
      id: "COPY_LINK";
      type: "copy";
      text: string;
      label: "Copy link";
      disabled?: boolean;
      disabledReason?: string;
    };

export interface DashboardReplay {
  id: string;
  peakY: number;
  replayToken: string | null;
}
