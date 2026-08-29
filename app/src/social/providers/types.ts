/**
 * SocialProvider abstraction (Epic R / AC-66, loop/architecture.md §6).
 *
 * Every method is called SERVER-SIDE ONLY. Implementations must:
 *  - never throw for "the platform doesn't support this" — return a
 *    ToolResult with reason "UNSUPPORTED_BY_PLATFORM" (AC-22, AC-56)
 *  - never fabricate a value for an unsupported metric (AC-43)
 *  - be the ONLY place platform-specific request/response shapes are known —
 *    callers (services/, agent tools) only ever see the types below
 *
 * Adding Instagram/LinkedIn/Facebook later = implement this interface + add
 * one enum value + register it. Zero change to approval/calendar/audit.
 */

import type { SocialContentType, SocialPlatform, ToolResult } from "../types";

export interface OAuthTokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string[];
}

export interface PlatformProfile {
  externalAccountId: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface PublishRequest {
  contentType: SocialContentType;
  caption?: string;
  title?: string;
  description?: string;
  hashtags?: string[];
  threadParts?: string[];
  externalAssetId?: string; // from a completed ContentAsset upload session
}

export interface PublishResult {
  externalPostId: string;
  publishedAt: Date;
  permalink: string | null;
}

export interface AnalyticsQuery {
  externalPostId?: string; // item-level; omitted for account-level queries
  since: Date;
  until: Date;
}

export interface AnalyticsResult {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  watchTimeSeconds: number | null;
  retentionPct: number | null;
  clicks: number | null;
  followers: number | null; // account-level, present on account queries
  notAvailableMetrics: string[]; // exhaustive list of requested metrics this tier doesn't expose
}

export interface UploadSessionInit {
  kind: "VIDEO" | "IMAGE";
  mimeType: string;
  sizeBytes: number;
  contentType: SocialContentType;
}

export interface UploadSessionHandle {
  chunkSizeBytes: number;
  /** Opaque, server-only session reference — never returned to the browser. */
  providerSessionRef: string;
}

export interface SocialProvider {
  readonly platform: SocialPlatform;

  readonly capabilities: {
    contentTypes: SocialContentType[];
    analyticsMetrics: Array<keyof AnalyticsResult>;
    uploadMechanism: "CHUNKED_RELAY" | "NONE";
    postingRequiresApproval: boolean; // true while app review / API tier is pending (R4/R6)
  };

  getAuthorizationUrl(state: string, redirectUri: string): string;
  /**
   * `codeVerifier` is the original server-issued `state` value for providers
   * whose OAuth2 flow uses PKCE with `state` doubling as the verifier (X);
   * ignored by providers that don't need it (TikTok, YouTube).
   */
  exchangeCodeForTokens(
    code: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<ToolResult<OAuthTokenSet>>;
  refreshAccessToken(refreshToken: string): Promise<ToolResult<OAuthTokenSet>>;
  revokeTokens(tokens: OAuthTokenSet): Promise<ToolResult<void>>;
  getProfile(accessToken: string): Promise<ToolResult<PlatformProfile>>;

  initiateUpload(
    accessToken: string,
    init: UploadSessionInit
  ): Promise<ToolResult<UploadSessionHandle>>;
  relayChunk(
    accessToken: string,
    handle: UploadSessionHandle,
    chunk: Buffer,
    rangeStart: number,
    rangeEnd: number,
    totalBytes: number
  ): Promise<ToolResult<{ complete: boolean; externalAssetId?: string }>>;

  publish(accessToken: string, request: PublishRequest): Promise<ToolResult<PublishResult>>;
  checkPostExists(accessToken: string, externalPostId: string): Promise<ToolResult<boolean>>;
  deletePost(accessToken: string, externalPostId: string): Promise<ToolResult<void>>;

  getAnalytics(accessToken: string, query: AnalyticsQuery): Promise<ToolResult<AnalyticsResult>>;
}
