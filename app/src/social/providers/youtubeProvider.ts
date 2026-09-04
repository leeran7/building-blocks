/**
 * YouTube provider — Google OAuth2 (confidential client) + YouTube Data API
 * v3 official resumable upload only. No password storage, no scraping.
 *
 * Docs: https://developers.google.com/identity/protocols/oauth2/web-server
 *       https://developers.google.com/youtube/v3/guides/using_resumable_upload_apis
 *
 * Video bytes flow: browser → our chunk-relay route → this provider's
 * `relayChunk`, which PUTs each chunk to Google's resumable session URI
 * (ADR-4). The session URI is treated as sensitive (redacted like a token —
 * it's a live, ~bearer-equivalent upload URL) and never returned to the
 * browser.
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

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
const RESUMABLE_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";
const CHUNK_SIZE_BYTES = 4 * 1024 * 1024;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

export const youtubeProvider: SocialProvider = {
  platform: "YOUTUBE",

  capabilities: {
    contentTypes: ["YOUTUBE_SHORT", "YOUTUBE_LONGFORM"],
    analyticsMetrics: ["views", "likes", "comments", "watchTimeSeconds", "retentionPct", "followers"],
    uploadMechanism: "CHUNKED_RELAY",
    postingRequiresApproval: false,
  },

  getAuthorizationUrl(state, redirectUri) {
    const clientId = requireEnv("YOUTUBE_CLIENT_ID");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/youtube.upload",
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/yt-analytics.readonly",
      ].join(" "),
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async exchangeCodeForTokens(code, redirectUri): Promise<ToolResult<OAuthTokenSet>> {
    try {
      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: requireEnv("YOUTUBE_CLIENT_ID"),
          client_secret: requireEnv("YOUTUBE_CLIENT_SECRET"),
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return errResult("PLATFORM_ERROR", data.error_description ?? `Google token exchange failed (${res.status})`);
      }
      return okResult({
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? null,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
        scopes: typeof data.scope === "string" ? data.scope.split(" ") : [],
      });
    } catch (err) {
      return errResult("PLATFORM_ERROR", `Google token exchange request failed: ${(err as Error).message}`);
    }
  },

  async refreshAccessToken(refreshToken): Promise<ToolResult<OAuthTokenSet>> {
    try {
      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          client_id: requireEnv("YOUTUBE_CLIENT_ID"),
          client_secret: requireEnv("YOUTUBE_CLIENT_SECRET"),
          grant_type: "refresh_token",
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return errResult("REAUTH_REQUIRED", data.error_description ?? "Google refresh token rejected");
      }
      return okResult({
        accessToken: data.access_token,
        // Google does not re-issue a refresh_token on refresh — keep the original.
        refreshToken,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
        scopes: typeof data.scope === "string" ? data.scope.split(" ") : [],
      });
    } catch (err) {
      return errResult("PLATFORM_ERROR", `Google token refresh request failed: ${(err as Error).message}`);
    }
  },

  async revokeTokens(tokens): Promise<ToolResult<void>> {
    try {
      const res = await fetch(REVOKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: tokens.accessToken }),
      });
      if (!res.ok) return errResult("PLATFORM_ERROR", `Google revoke failed (${res.status})`);
      return okResult(undefined);
    } catch (err) {
      return errResult("PLATFORM_ERROR", `Google revoke request failed: ${(err as Error).message}`);
    }
  },

  async getProfile(accessToken): Promise<ToolResult<PlatformProfile>> {
    try {
      const params = new URLSearchParams({ part: "snippet,id", mine: "true" });
      const res = await fetch(`${CHANNELS_URL}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return errResult("PLATFORM_ERROR", data.error?.message ?? `YouTube channel fetch failed (${res.status})`);
      }
      const channel = data.items?.[0];
      if (!channel) return errResult("NOT_FOUND", "No YouTube channel found for this Google account");
      return okResult({
        externalAccountId: channel.id,
        handle: channel.snippet?.customUrl ?? channel.snippet?.title ?? "unknown",
        displayName: channel.snippet?.title ?? null,
        avatarUrl: channel.snippet?.thumbnails?.default?.url ?? null,
      });
    } catch (err) {
      return errResult("PLATFORM_ERROR", `YouTube channel request failed: ${(err as Error).message}`);
    }
  },

  async initiateUpload(accessToken, init: UploadSessionInit): Promise<ToolResult<UploadSessionHandle>> {
    if (init.kind !== "VIDEO") {
      return errResult("UNSUPPORTED_BY_PLATFORM", "YouTube only supports video uploads via this integration");
    }
    try {
      const params = new URLSearchParams({ uploadType: "resumable", part: "snippet,status" });
      const res = await fetch(`${RESUMABLE_UPLOAD_URL}?${params.toString()}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": init.mimeType,
          "X-Upload-Content-Length": String(init.sizeBytes),
        },
        body: JSON.stringify({
          snippet: { title: "Untitled draft", description: "" },
          status: { privacyStatus: "private" },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return errResult("PLATFORM_ERROR", data.error?.message ?? `YouTube resumable session init failed (${res.status})`);
      }
      const sessionUri = res.headers.get("Location");
      if (!sessionUri) return errResult("PLATFORM_ERROR", "YouTube did not return a resumable session URI");
      return okResult({ chunkSizeBytes: CHUNK_SIZE_BYTES, providerSessionRef: sessionUri });
    } catch (err) {
      return errResult("PLATFORM_ERROR", `YouTube upload init request failed: ${(err as Error).message}`);
    }
  },

  async relayChunk(_accessToken, handle, chunk, rangeStart, rangeEnd, totalBytes) {
    try {
      const res = await fetch(handle.providerSessionRef, {
        method: "PUT",
        headers: {
          "Content-Range": `bytes ${rangeStart}-${rangeEnd}/${totalBytes}`,
          "Content-Length": String(chunk.length),
        },
        body: new Uint8Array(chunk),
      });
      if (res.status === 308) {
        return okResult({ complete: false }); // "Resume Incomplete" — expected mid-upload
      }
      if (!res.ok) {
        return errResult("PLATFORM_ERROR", `YouTube chunk upload failed (${res.status})`);
      }
      const data = await res.json();
      return okResult({ complete: true, externalAssetId: data.id });
    } catch (err) {
      return errResult("PLATFORM_ERROR", `YouTube chunk relay request failed: ${(err as Error).message}`);
    }
  },

  async publish(accessToken, request: PublishRequest): Promise<ToolResult<PublishResult>> {
    if (!request.externalAssetId) {
      return errResult("VALIDATION_ERROR", "YouTube publish requires a completed video upload (externalAssetId)");
    }
    try {
      const res = await fetch(`${VIDEOS_URL}?part=snippet,status`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          id: request.externalAssetId,
          snippet: {
            title: request.title?.slice(0, 100) ?? "Untitled",
            description: request.description ?? "",
            tags: request.hashtags,
          },
          status: { privacyStatus: "public" },
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return errResult("PLATFORM_ERROR", data.error?.message ?? `YouTube metadata publish failed (${res.status})`);
      }
      return okResult({
        externalPostId: data.id,
        publishedAt: new Date(),
        permalink: `https://youtube.com/watch?v=${data.id}`,
      });
    } catch (err) {
      return errResult("PLATFORM_ERROR", `YouTube publish request failed: ${(err as Error).message}`);
    }
  },

  async checkPostExists(accessToken, externalPostId): Promise<ToolResult<boolean>> {
    try {
      const res = await fetch(`${VIDEOS_URL}?part=id&id=${externalPostId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) return errResult("PLATFORM_ERROR", `YouTube video lookup failed (${res.status})`);
      return okResult((data.items?.length ?? 0) > 0);
    } catch (err) {
      return errResult("PLATFORM_ERROR", `YouTube video lookup request failed: ${(err as Error).message}`);
    }
  },

  async deletePost(accessToken, externalPostId): Promise<ToolResult<void>> {
    try {
      const res = await fetch(`${VIDEOS_URL}?id=${externalPostId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok && res.status !== 204) {
        return errResult("PLATFORM_ERROR", `YouTube delete failed (${res.status})`);
      }
      return okResult(undefined);
    } catch (err) {
      return errResult("PLATFORM_ERROR", `YouTube delete request failed: ${(err as Error).message}`);
    }
  },

  async getAnalytics(accessToken, query: AnalyticsQuery): Promise<ToolResult<AnalyticsResult>> {
    try {
      if (!query.externalPostId) {
        const res = await fetch(`${CHANNELS_URL}?part=statistics&mine=true`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          return errResult("PLATFORM_ERROR", data.error?.message ?? `YouTube channel stats fetch failed (${res.status})`);
        }
        const stats = data.items?.[0]?.statistics ?? {};
        return okResult({
          views: stats.viewCount ? Number(stats.viewCount) : null,
          likes: null,
          comments: null,
          shares: null,
          watchTimeSeconds: null,
          retentionPct: null,
          clicks: null,
          followers: stats.subscriberCount ? Number(stats.subscriberCount) : null,
          notAvailableMetrics: ["likes", "comments", "shares", "watchTimeSeconds", "retentionPct", "clicks"],
        });
      }

      const res = await fetch(`${VIDEOS_URL}?part=statistics&id=${query.externalPostId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return errResult("PLATFORM_ERROR", data.error?.message ?? `YouTube video stats fetch failed (${res.status})`);
      }
      const stats = data.items?.[0]?.statistics ?? {};
      return okResult({
        views: stats.viewCount ? Number(stats.viewCount) : null,
        likes: stats.likeCount ? Number(stats.likeCount) : null,
        comments: stats.commentCount ? Number(stats.commentCount) : null,
        shares: null,
        // Watch time/retention require the separate YouTube Analytics API
        // (yt-analytics.readonly scope) — not implemented in this pass; report
        // truthfully rather than fabricating a number (AC-43).
        watchTimeSeconds: null,
        retentionPct: null,
        clicks: null,
        followers: null,
        notAvailableMetrics: ["shares", "watchTimeSeconds", "retentionPct", "clicks"],
      });
    } catch (err) {
      return errResult("PLATFORM_ERROR", `YouTube analytics request failed: ${(err as Error).message}`);
    }
  },
};
