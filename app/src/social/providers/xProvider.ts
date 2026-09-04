/**
 * X (Twitter) provider — X API v2 official OAuth2 (PKCE) + Posts/Media API
 * only. No password storage, no scraping (R6).
 *
 * Docs: https://developer.x.com/en/docs/authentication/oauth-2-0/authorization-code
 *       https://developer.x.com/en/docs/x-api/tweets/manage-tweets/api-reference/post-tweets
 *
 * NOTE: meaningful write access (posting) has historically required a paid
 * API tier. `publish()` surfaces a `PLAN_INSUFFICIENT`-style UNSUPPORTED
 * result (mapped from a 403) rather than silently failing or faking success.
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

const AUTH_URL = "https://twitter.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
const REVOKE_URL = "https://api.twitter.com/2/oauth2/revoke";
const ME_URL = "https://api.twitter.com/2/users/me";
const TWEETS_URL = "https://api.twitter.com/2/tweets";
const MEDIA_UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json";
const CHUNK_SIZE_BYTES = 4 * 1024 * 1024;

// X OAuth2 (public/confidential client with PKCE) does not require a fresh
// code_verifier round-trip stored server-side per this integration's simple
// authorization-code flow; a fixed, per-request-generated challenge derived
// from the server-issued `state` value doubles as the PKCE verifier, keeping
// the flow stateless beyond the existing SocialOAuthState row.
function pkceChallengeFromState(state: string): string {
  return state; // state IS the code_verifier (43-128 chars, matches OAuthState id length)
}

function basicAuthHeader(): string {
  const id = requireEnv("X_CLIENT_ID");
  const secret = requireEnv("X_CLIENT_SECRET");
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

export const xProvider: SocialProvider = {
  platform: "X",

  capabilities: {
    contentTypes: ["X_POST", "X_THREAD"],
    analyticsMetrics: ["views", "likes", "comments", "shares", "followers"],
    uploadMechanism: "CHUNKED_RELAY",
    postingRequiresApproval: false,
  },

  getAuthorizationUrl(state, redirectUri) {
    const clientId = requireEnv("X_CLIENT_ID");
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "tweet.read tweet.write users.read offline.access",
      state,
      code_challenge: pkceChallengeFromState(state),
      code_challenge_method: "plain",
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async exchangeCodeForTokens(code, redirectUri, codeVerifier): Promise<ToolResult<OAuthTokenSet>> {
    if (!codeVerifier) {
      return errResult("VALIDATION_ERROR", "X OAuth2 PKCE flow requires the original code_verifier (server-issued state)");
    }
    try {
      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: basicAuthHeader(),
        },
        body: new URLSearchParams({
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return errResult("PLATFORM_ERROR", data.error_description ?? `X token exchange failed (${res.status})`);
      }
      return okResult({
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? null,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
        scopes: typeof data.scope === "string" ? data.scope.split(" ") : [],
      });
    } catch (err) {
      return errResult("PLATFORM_ERROR", `X token exchange request failed: ${(err as Error).message}`);
    }
  },

  async refreshAccessToken(refreshToken): Promise<ToolResult<OAuthTokenSet>> {
    try {
      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: basicAuthHeader(),
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return errResult("REAUTH_REQUIRED", data.error_description ?? "X refresh token rejected");
      }
      return okResult({
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? refreshToken,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
        scopes: typeof data.scope === "string" ? data.scope.split(" ") : [],
      });
    } catch (err) {
      return errResult("PLATFORM_ERROR", `X token refresh request failed: ${(err as Error).message}`);
    }
  },

  async revokeTokens(tokens): Promise<ToolResult<void>> {
    try {
      const res = await fetch(REVOKE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: basicAuthHeader(),
        },
        body: new URLSearchParams({ token: tokens.accessToken, token_type_hint: "access_token" }),
      });
      if (!res.ok) return errResult("PLATFORM_ERROR", `X revoke failed (${res.status})`);
      return okResult(undefined);
    } catch (err) {
      return errResult("PLATFORM_ERROR", `X revoke request failed: ${(err as Error).message}`);
    }
  },

  async getProfile(accessToken): Promise<ToolResult<PlatformProfile>> {
    try {
      const res = await fetch(`${ME_URL}?user.fields=profile_image_url,username,name`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok || data.errors) {
        return errResult("PLATFORM_ERROR", data.errors?.[0]?.message ?? `X profile fetch failed (${res.status})`);
      }
      const user = data.data ?? {};
      return okResult({
        externalAccountId: user.id,
        handle: user.username ? `@${user.username}` : "unknown",
        displayName: user.name ?? null,
        avatarUrl: user.profile_image_url ?? null,
      });
    } catch (err) {
      return errResult("PLATFORM_ERROR", `X profile request failed: ${(err as Error).message}`);
    }
  },

  async initiateUpload(accessToken, init: UploadSessionInit): Promise<ToolResult<UploadSessionHandle>> {
    try {
      const params = new URLSearchParams({
        command: "INIT",
        total_bytes: String(init.sizeBytes),
        media_type: init.mimeType,
        media_category: init.kind === "VIDEO" ? "tweet_video" : "tweet_image",
      });
      const res = await fetch(`${MEDIA_UPLOAD_URL}?${params.toString()}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) {
        return errResult("PLATFORM_ERROR", data.errors?.[0]?.message ?? `X media init failed (${res.status})`);
      }
      return okResult({ chunkSizeBytes: CHUNK_SIZE_BYTES, providerSessionRef: String(data.media_id_string) });
    } catch (err) {
      return errResult("PLATFORM_ERROR", `X media init request failed: ${(err as Error).message}`);
    }
  },

  async relayChunk(accessToken, handle, chunk, rangeStart, _rangeEnd, totalBytes) {
    try {
      const segmentIndex = Math.floor(rangeStart / handle.chunkSizeBytes);
      const form = new FormData();
      form.append("command", "APPEND");
      form.append("media_id", handle.providerSessionRef);
      form.append("segment_index", String(segmentIndex));
      form.append("media", new Blob([new Uint8Array(chunk)]));
      const appendRes = await fetch(MEDIA_UPLOAD_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      if (!appendRes.ok) {
        return errResult("PLATFORM_ERROR", `X media chunk upload failed (${appendRes.status})`);
      }

      const bytesAfterThisChunk = rangeStart + chunk.length;
      if (bytesAfterThisChunk < totalBytes) {
        return okResult({ complete: false });
      }

      const finalizeParams = new URLSearchParams({
        command: "FINALIZE",
        media_id: handle.providerSessionRef,
      });
      const finalizeRes = await fetch(`${MEDIA_UPLOAD_URL}?${finalizeParams.toString()}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const finalizeData = await finalizeRes.json();
      if (!finalizeRes.ok) {
        return errResult("PLATFORM_ERROR", finalizeData.errors?.[0]?.message ?? `X media finalize failed (${finalizeRes.status})`);
      }
      return okResult({ complete: true, externalAssetId: handle.providerSessionRef });
    } catch (err) {
      return errResult("PLATFORM_ERROR", `X chunk relay request failed: ${(err as Error).message}`);
    }
  },

  async publish(accessToken, request: PublishRequest): Promise<ToolResult<PublishResult>> {
    try {
      if (request.contentType === "X_THREAD" && request.threadParts?.length) {
        return await publishThread(accessToken, request.threadParts, request.externalAssetId);
      }
      const body: Record<string, unknown> = { text: request.caption ?? "" };
      if (request.externalAssetId) {
        body.media = { media_ids: [request.externalAssetId] };
      }
      const res = await fetch(TWEETS_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.status === 403) {
        return errResult(
          "UNSUPPORTED_BY_PLATFORM",
          "X rejected this write request — the connected app's API access tier likely doesn't include posting. Upgrade the X Developer App's plan to Basic or higher."
        );
      }
      if (!res.ok || data.errors) {
        return errResult("PLATFORM_ERROR", data.errors?.[0]?.detail ?? `X post failed (${res.status})`);
      }
      return okResult({
        externalPostId: data.data.id,
        publishedAt: new Date(),
        permalink: `https://x.com/i/web/status/${data.data.id}`,
      });
    } catch (err) {
      return errResult("PLATFORM_ERROR", `X publish request failed: ${(err as Error).message}`);
    }
  },

  async checkPostExists(accessToken, externalPostId): Promise<ToolResult<boolean>> {
    try {
      const res = await fetch(`${TWEETS_URL}/${externalPostId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.status === 404) return okResult(false);
      if (!res.ok) return errResult("PLATFORM_ERROR", `X post lookup failed (${res.status})`);
      return okResult(true);
    } catch (err) {
      return errResult("PLATFORM_ERROR", `X post lookup request failed: ${(err as Error).message}`);
    }
  },

  async deletePost(accessToken, externalPostId): Promise<ToolResult<void>> {
    try {
      const res = await fetch(`${TWEETS_URL}/${externalPostId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return errResult("PLATFORM_ERROR", `X delete failed (${res.status})`);
      return okResult(undefined);
    } catch (err) {
      return errResult("PLATFORM_ERROR", `X delete request failed: ${(err as Error).message}`);
    }
  },

  async getAnalytics(accessToken, query: AnalyticsQuery): Promise<ToolResult<AnalyticsResult>> {
    const notAvailableMetrics: string[] = ["watchTimeSeconds", "retentionPct", "clicks"];
    try {
      if (!query.externalPostId) {
        const res = await fetch(`${ME_URL}?user.fields=public_metrics`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();
        if (!res.ok || data.errors) {
          return errResult("PLATFORM_ERROR", data.errors?.[0]?.detail ?? `X account metrics fetch failed (${res.status})`);
        }
        const metrics = data.data?.public_metrics ?? {};
        return okResult({
          views: null,
          likes: null,
          comments: null,
          shares: null,
          watchTimeSeconds: null,
          retentionPct: null,
          clicks: null,
          followers: metrics.followers_count ?? null,
          notAvailableMetrics: [...notAvailableMetrics, "views", "likes", "comments", "shares"],
        });
      }

      const res = await fetch(
        `${TWEETS_URL}/${query.externalPostId}?tweet.fields=public_metrics,non_public_metrics`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await res.json();
      if (!res.ok || data.errors) {
        return errResult("PLATFORM_ERROR", data.errors?.[0]?.detail ?? `X post metrics fetch failed (${res.status})`);
      }
      const pub = data.data?.public_metrics ?? {};
      const nonPub = data.data?.non_public_metrics ?? null; // requires elevated access; may be absent
      return okResult({
        views: nonPub?.impression_count ?? null,
        likes: pub.like_count ?? null,
        comments: pub.reply_count ?? null,
        shares: pub.retweet_count ?? null,
        watchTimeSeconds: null,
        retentionPct: null,
        clicks: nonPub?.url_link_clicks ?? null,
        followers: null,
        notAvailableMetrics: nonPub
          ? ["watchTimeSeconds", "retentionPct"]
          : [...notAvailableMetrics, "views", "clicks"],
      });
    } catch (err) {
      return errResult("PLATFORM_ERROR", `X analytics request failed: ${(err as Error).message}`);
    }
  },
};

async function publishThread(
  accessToken: string,
  parts: string[],
  externalAssetId?: string
): Promise<ToolResult<PublishResult>> {
  let previousId: string | null = null;
  let firstId: string | null = null;
  for (let i = 0; i < parts.length; i++) {
    const body: Record<string, unknown> = { text: parts[i] };
    if (previousId) body.reply = { in_reply_to_tweet_id: previousId };
    if (i === 0 && externalAssetId) body.media = { media_ids: [externalAssetId] };
    const res = await fetch(TWEETS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.status === 403) {
      return errResult(
        "UNSUPPORTED_BY_PLATFORM",
        `X rejected thread post ${i + 1}/${parts.length} — the connected app's API tier likely doesn't include posting.`
      );
    }
    if (!res.ok || data.errors) {
      return errResult(
        "PLATFORM_ERROR",
        `X thread post ${i + 1}/${parts.length} failed: ${data.errors?.[0]?.detail ?? res.status}`
      );
    }
    previousId = data.data.id;
    if (i === 0) firstId = data.data.id;
  }
  return okResult({
    externalPostId: firstId!,
    publishedAt: new Date(),
    permalink: `https://x.com/i/web/status/${firstId}`,
  });
}
