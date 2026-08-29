/**
 * TikTok provider — TikTok for Developers official OAuth2 + Content Posting
 * API only. No browser automation, no scraping, no password storage (R4).
 *
 * Docs: https://developers.tiktok.com/doc/login-kit-web
 *       https://developers.tiktok.com/doc/content-posting-api-get-started
 *
 * NOTE: TikTok's Content Posting API requires app review for
 * unaudited-client restrictions to be lifted (direct public posting). Until
 * that approval lands, `capabilities.postingRequiresApproval = true` and
 * `publish()` returns UNSUPPORTED_BY_PLATFORM with a clear explanation
 * instead of attempting an unofficial workaround (AC-56).
 */

import type {
  AnalyticsQuery,
  AnalyticsResult,
  OAuthTokenSet,
  PlatformProfile,
  PublishRequest,
  PublishResult,
  SocialProvider,
  UploadSessionHandle,
  UploadSessionInit,
} from "./types";
import { errResult, okResult, type ToolResult } from "../types";

const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const REVOKE_URL = "https://open.tiktokapis.com/v2/oauth/revoke/";
const USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/";
const VIDEO_INIT_URL = "https://open.tiktokapis.com/v2/post/publish/video/init/";
const CHUNK_SIZE_BYTES = 4 * 1024 * 1024; // stays under Vercel's serverless request-body limit (ADR-4)

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

export const tiktokProvider: SocialProvider = {
  platform: "TIKTOK",

  capabilities: {
    contentTypes: ["TIKTOK_VIDEO"],
    analyticsMetrics: ["views", "likes", "comments", "shares"],
    uploadMechanism: "CHUNKED_RELAY",
    postingRequiresApproval: true,
  },

  getAuthorizationUrl(state, redirectUri) {
    const clientKey = requireEnv("TIKTOK_CLIENT_KEY");
    const params = new URLSearchParams({
      client_key: clientKey,
      response_type: "code",
      scope: "user.info.basic,video.publish,video.list",
      redirect_uri: redirectUri,
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async exchangeCodeForTokens(code, redirectUri, _codeVerifier): Promise<ToolResult<OAuthTokenSet>> {
    try {
      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: requireEnv("TIKTOK_CLIENT_KEY"),
          client_secret: requireEnv("TIKTOK_CLIENT_SECRET"),
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return errResult("PLATFORM_ERROR", data.error_description ?? `TikTok token exchange failed (${res.status})`);
      }
      return okResult({
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? null,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
        scopes: typeof data.scope === "string" ? data.scope.split(",") : [],
      });
    } catch (err) {
      return errResult("PLATFORM_ERROR", `TikTok token exchange request failed: ${(err as Error).message}`);
    }
  },

  async refreshAccessToken(refreshToken): Promise<ToolResult<OAuthTokenSet>> {
    try {
      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: requireEnv("TIKTOK_CLIENT_KEY"),
          client_secret: requireEnv("TIKTOK_CLIENT_SECRET"),
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return errResult("REAUTH_REQUIRED", data.error_description ?? "TikTok refresh token rejected");
      }
      return okResult({
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? refreshToken,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
        scopes: typeof data.scope === "string" ? data.scope.split(",") : [],
      });
    } catch (err) {
      return errResult("PLATFORM_ERROR", `TikTok token refresh request failed: ${(err as Error).message}`);
    }
  },

  async revokeTokens(tokens): Promise<ToolResult<void>> {
    try {
      const res = await fetch(REVOKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: requireEnv("TIKTOK_CLIENT_KEY"),
          client_secret: requireEnv("TIKTOK_CLIENT_SECRET"),
          token: tokens.accessToken,
        }),
      });
      if (!res.ok) {
        return errResult("PLATFORM_ERROR", `TikTok revoke failed (${res.status})`);
      }
      return okResult(undefined);
    } catch (err) {
      return errResult("PLATFORM_ERROR", `TikTok revoke request failed: ${(err as Error).message}`);
    }
  },

  async getProfile(accessToken): Promise<ToolResult<PlatformProfile>> {
    try {
      const params = new URLSearchParams({
        fields: "open_id,display_name,avatar_url,username",
      });
      const res = await fetch(`${USER_INFO_URL}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok || data.error?.code !== "ok") {
        return errResult("PLATFORM_ERROR", data.error?.message ?? `TikTok profile fetch failed (${res.status})`);
      }
      const user = data.data?.user ?? {};
      return okResult({
        externalAccountId: user.open_id,
        handle: user.username ?? user.display_name ?? "unknown",
        displayName: user.display_name ?? null,
        avatarUrl: user.avatar_url ?? null,
      });
    } catch (err) {
      return errResult("PLATFORM_ERROR", `TikTok profile request failed: ${(err as Error).message}`);
    }
  },

  async initiateUpload(accessToken, init: UploadSessionInit): Promise<ToolResult<UploadSessionHandle>> {
    if (init.kind !== "VIDEO") {
      return errResult("UNSUPPORTED_BY_PLATFORM", "TikTok only supports video uploads via this integration");
    }
    try {
      const res = await fetch(VIDEO_INIT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          source_info: {
            source: "FILE_UPLOAD",
            video_size: init.sizeBytes,
            chunk_size: CHUNK_SIZE_BYTES,
            total_chunk_count: Math.ceil(init.sizeBytes / CHUNK_SIZE_BYTES),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error?.code !== "ok") {
        return errResult("PLATFORM_ERROR", data.error?.message ?? `TikTok upload init failed (${res.status})`);
      }
      return okResult({
        chunkSizeBytes: CHUNK_SIZE_BYTES,
        providerSessionRef: data.data?.upload_url ?? data.data?.publish_id,
      });
    } catch (err) {
      return errResult("PLATFORM_ERROR", `TikTok upload init request failed: ${(err as Error).message}`);
    }
  },

  async relayChunk(_accessToken, handle, chunk, rangeStart, rangeEnd, totalBytes) {
    try {
      const res = await fetch(handle.providerSessionRef, {
        method: "PUT",
        headers: {
          "Content-Range": `bytes ${rangeStart}-${rangeEnd}/${totalBytes}`,
          "Content-Type": "video/mp4",
          "Content-Length": String(chunk.length),
        },
        body: new Uint8Array(chunk),
      });
      if (!res.ok && res.status !== 206) {
        return errResult("PLATFORM_ERROR", `TikTok chunk upload failed (${res.status})`);
      }
      const complete = rangeEnd + 1 >= totalBytes;
      return okResult({ complete, externalAssetId: complete ? handle.providerSessionRef : undefined });
    } catch (err) {
      return errResult("PLATFORM_ERROR", `TikTok chunk relay request failed: ${(err as Error).message}`);
    }
  },

  async publish(_accessToken, _request: PublishRequest): Promise<ToolResult<PublishResult>> {
    // Direct/public posting requires TikTok app review beyond sandbox access
    // (R4). Report the limitation truthfully rather than faking success or
    // falling back to an unofficial workaround (AC-56).
    return errResult(
      "UNSUPPORTED_BY_PLATFORM",
      "Publishing directly to TikTok requires this app to complete TikTok's Content Posting API review for the video.publish scope. Until approved, prepare drafts here and publish manually via the TikTok app, or re-run once the app is approved."
    );
  },

  async checkPostExists(_accessToken, _externalPostId): Promise<ToolResult<boolean>> {
    return errResult("UNSUPPORTED_BY_PLATFORM", "TikTok post-existence lookup is not available until publishing is approved");
  },

  async deletePost(_accessToken, _externalPostId): Promise<ToolResult<void>> {
    return errResult("UNSUPPORTED_BY_PLATFORM", "Deleting a TikTok post via API is not supported by this integration");
  },

  async getAnalytics(_accessToken, _query: AnalyticsQuery): Promise<ToolResult<AnalyticsResult>> {
    return okResult({
      views: null,
      likes: null,
      comments: null,
      shares: null,
      watchTimeSeconds: null,
      retentionPct: null,
      clicks: null,
      followers: null,
      notAvailableMetrics: [
        "views",
        "likes",
        "comments",
        "shares",
        "watchTimeSeconds",
        "retentionPct",
        "clicks",
        "followers",
      ],
    });
  },
};
