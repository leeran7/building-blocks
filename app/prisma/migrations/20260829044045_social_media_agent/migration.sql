-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('TIKTOK', 'X', 'YOUTUBE');

-- CreateEnum
CREATE TYPE "SocialAccountStatus" AS ENUM ('CONNECTED', 'TOKEN_EXPIRED', 'REAUTH_REQUIRED', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "SocialContentType" AS ENUM ('TIKTOK_VIDEO', 'YOUTUBE_SHORT', 'YOUTUBE_LONGFORM', 'X_POST', 'X_THREAD');

-- CreateEnum
CREATE TYPE "SocialContentStatus" AS ENUM ('IDEA', 'DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SocialApprovalMode" AS ENUM ('ALWAYS_REQUIRE_APPROVAL', 'AUTO_PUBLISH_TRUSTED', 'MANUAL_ONLY');

-- CreateEnum
CREATE TYPE "SocialAssetKind" AS ENUM ('VIDEO', 'IMAGE');

-- CreateEnum
CREATE TYPE "SocialAssetStatus" AS ENUM ('PENDING', 'UPLOADING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "SocialPublicationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'RATE_LIMITED');

-- CreateEnum
CREATE TYPE "SocialAgentRunKind" AS ENUM ('CHAT_TURN', 'CONTENT_STUDIO_GENERATION', 'REPURPOSE_CONTENT', 'WEEKLY_STRATEGY', 'ANALYTICS_REFRESH', 'PUBLISH_SWEEP', 'TOKEN_REFRESH_SWEEP');

-- CreateEnum
CREATE TYPE "SocialAgentRunStatus" AS ENUM ('PENDING', 'RUNNING', 'WAITING_ON_STEP', 'SUCCEEDED', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "SocialAgentTaskStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "SocialAgentToolName" AS ENUM ('get_social_accounts', 'get_brand_profile', 'get_content_calendar', 'create_content_idea', 'generate_script', 'generate_caption', 'generate_title', 'generate_description', 'create_content_variations', 'repurpose_content', 'create_post', 'create_thread', 'prepare_video_upload', 'schedule_content', 'publish_content', 'get_social_analytics', 'analyze_content_performance', 'generate_weekly_strategy');

-- CreateEnum
CREATE TYPE "SocialAuditAction" AS ENUM ('CONNECT_ACCOUNT', 'DISCONNECT_ACCOUNT', 'CREATE_CONTENT', 'UPDATE_CONTENT', 'REGENERATE_CONTENT', 'DUPLICATE_CONTENT', 'DELETE_CONTENT', 'APPROVE_CONTENT', 'REJECT_CONTENT', 'SCHEDULE_CONTENT', 'RESCHEDULE_CONTENT', 'PUBLISH_CONTENT', 'DELETE_PLATFORM_POST', 'TOKEN_REFRESH', 'ANALYTICS_REFRESH', 'WEEKLY_STRATEGY_RUN', 'BRAND_PROFILE_UPDATE', 'AUTOMATION_SETTINGS_UPDATE', 'AUTO_PUBLISH');

-- CreateEnum
CREATE TYPE "SocialAuditResult" AS ENUM ('SUCCESS', 'FAILURE');

-- NOTE: This migration is intentionally scoped to ONLY the additive social-
-- media feature tables/enums below. Prisma's diff engine also detected
-- pre-existing drift on the untouched `blocks`/`payments`/`climb_records`
-- tables (constraint/index names that differ from Prisma's default naming
-- convention, e.g. "blocks_season_fk" vs "blocks_season_id_fkey") — those
-- lines have been deliberately removed from this migration. Per the spec's
-- hard constraint ("no existing table... modified except for additive new
-- tables/relations"), this migration never renames/drops/recreates any
-- existing index, constraint, or column on a pre-existing table.

-- CreateTable
CREATE TABLE "social_accounts" (
    "id" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "status" "SocialAccountStatus" NOT NULL DEFAULT 'CONNECTED',
    "accessTokenEncrypted" TEXT,
    "refreshTokenEncrypted" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastSyncedAt" TIMESTAMP(3),
    "connectedByUid" TEXT NOT NULL,
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_oauth_states" (
    "id" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "initiatedByUid" TEXT NOT NULL,
    "redirectAfter" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "social_oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_brand_profiles" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "name" TEXT NOT NULL,
    "niche" TEXT,
    "audience" TEXT,
    "tone" TEXT,
    "style" TEXT,
    "topicsToDiscuss" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "topicsToAvoid" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ctas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "terminology" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "competitors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "products" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "positioning" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUid" TEXT,

    CONSTRAINT "social_brand_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_brand_profile_snapshots" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUid" TEXT,

    CONSTRAINT "social_brand_profile_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_automation_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "approvalMode" "SocialApprovalMode" NOT NULL DEFAULT 'ALWAYS_REQUIRE_APPROVAL',
    "autoPublishWhitelist" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUid" TEXT,

    CONSTRAINT "social_automation_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_content_items" (
    "id" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "contentType" "SocialContentType" NOT NULL,
    "status" "SocialContentStatus" NOT NULL DEFAULT 'DRAFT',
    "promptBatchId" TEXT,
    "sourceItemId" TEXT,
    "prompt" TEXT,
    "title" TEXT,
    "hook" TEXT,
    "script" TEXT,
    "caption" TEXT,
    "description" TEXT,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cta" TEXT,
    "visualDirection" TEXT,
    "threadParts" JSONB,
    "brandProfileVersion" INTEGER,
    "generatedByModel" TEXT,
    "sourceToolName" "SocialAgentToolName",
    "socialAccountId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "externalPostId" TEXT,
    "approvedByUid" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedByUid" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "failureReason" TEXT,
    "blockedByAvoidTerm" BOOLEAN NOT NULL DEFAULT false,
    "blockedTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "validationErrors" JSONB,
    "autoPublishEligible" BOOLEAN NOT NULL DEFAULT false,
    "generatedForIsoWeek" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lockedAt" TIMESTAMP(3),
    "publishAttempts" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdByUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_content_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_content_assets" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "kind" "SocialAssetKind" NOT NULL,
    "status" "SocialAssetStatus" NOT NULL DEFAULT 'PENDING',
    "sourceFilename" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "chunkSizeBytes" INTEGER NOT NULL,
    "bytesUploaded" INTEGER NOT NULL DEFAULT 0,
    "externalAssetId" TEXT,
    "platformUploadSessionUri" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_content_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_publications" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "socialAccountId" TEXT,
    "attemptNumber" INTEGER NOT NULL,
    "status" "SocialPublicationStatus" NOT NULL DEFAULT 'PENDING',
    "externalPostId" TEXT,
    "rateLimitedUntil" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "rawResponseSanitized" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "social_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_content_analytics_snapshots" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "views" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "watchTimeSeconds" INTEGER,
    "retentionPct" DOUBLE PRECISION,
    "clicks" INTEGER,
    "notAvailableMetrics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rawResponseSanitized" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_content_analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_account_analytics_snapshots" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "followers" INTEGER,
    "notAvailableMetrics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_account_analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_ai_recommendations" (
    "id" TEXT NOT NULL,
    "isoWeek" TEXT NOT NULL,
    "bestPlatform" "SocialPlatform",
    "bestTopic" TEXT,
    "bestHook" TEXT,
    "topPostContentItemId" TEXT,
    "weekOverWeekDeltaPct" DOUBLE PRECISION,
    "recommendations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rawModelOutputSanitized" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_ai_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_agent_runs" (
    "id" TEXT NOT NULL,
    "kind" "SocialAgentRunKind" NOT NULL,
    "status" "SocialAgentRunStatus" NOT NULL DEFAULT 'PENDING',
    "initiatedByUid" TEXT,
    "initiatedBySystem" TEXT,
    "input" JSONB NOT NULL,
    "isoWeek" TEXT,
    "currentStepIndex" INTEGER NOT NULL DEFAULT 0,
    "maxSteps" INTEGER NOT NULL DEFAULT 12,
    "lockedAt" TIMESTAMP(3),
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_agent_tasks" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "toolName" "SocialAgentToolName",
    "contentItemId" TEXT,
    "input" JSONB,
    "outputSanitized" JSONB,
    "status" "SocialAgentTaskStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_agent_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_audit_logs" (
    "id" TEXT NOT NULL,
    "action" "SocialAuditAction" NOT NULL,
    "platform" "SocialPlatform",
    "socialAccountId" TEXT,
    "contentItemId" TEXT,
    "result" "SocialAuditResult" NOT NULL,
    "initiator" TEXT NOT NULL,
    "errorDetail" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "social_account_platform_status_idx" ON "social_accounts"("platform", "status");

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_platform_externalAccountId_key" ON "social_accounts"("platform", "externalAccountId");

-- CreateIndex
CREATE INDEX "social_oauth_state_expires_idx" ON "social_oauth_states"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "social_brand_profile_snapshots_version_key" ON "social_brand_profile_snapshots"("version");

-- CreateIndex
CREATE INDEX "social_content_status_scheduled_idx" ON "social_content_items"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "social_content_platform_status_idx" ON "social_content_items"("platform", "status");

-- CreateIndex
CREATE INDEX "social_content_source_item_idx" ON "social_content_items"("sourceItemId");

-- CreateIndex
CREATE INDEX "social_content_prompt_batch_idx" ON "social_content_items"("promptBatchId");

-- CreateIndex
CREATE INDEX "social_content_iso_week_idx" ON "social_content_items"("generatedForIsoWeek");

-- CreateIndex
CREATE INDEX "social_content_created_at_idx" ON "social_content_items"("createdAt");

-- CreateIndex
CREATE INDEX "social_asset_item_status_idx" ON "social_content_assets"("contentItemId", "status");

-- CreateIndex
CREATE INDEX "social_publication_item_idx" ON "social_publications"("contentItemId");

-- CreateIndex
CREATE INDEX "social_publication_status_idx" ON "social_publications"("status");

-- CreateIndex
CREATE UNIQUE INDEX "social_publications_contentItemId_attemptNumber_key" ON "social_publications"("contentItemId", "attemptNumber");

-- CreateIndex
CREATE INDEX "social_content_analytics_item_idx" ON "social_content_analytics_snapshots"("contentItemId");

-- CreateIndex
CREATE UNIQUE INDEX "social_content_analytics_snapshots_contentItemId_snapshotDa_key" ON "social_content_analytics_snapshots"("contentItemId", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "social_account_analytics_snapshots_socialAccountId_snapshot_key" ON "social_account_analytics_snapshots"("socialAccountId", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "social_ai_recommendations_isoWeek_key" ON "social_ai_recommendations"("isoWeek");

-- CreateIndex
CREATE INDEX "social_agent_run_kind_status_idx" ON "social_agent_runs"("kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "social_agent_tasks_agentRunId_stepIndex_key" ON "social_agent_tasks"("agentRunId", "stepIndex");

-- CreateIndex
CREATE INDEX "social_audit_created_at_idx" ON "social_audit_logs"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "social_audit_platform_action_result_idx" ON "social_audit_logs"("platform", "action", "result");

-- CreateIndex
CREATE INDEX "social_audit_account_idx" ON "social_audit_logs"("socialAccountId");

-- CreateIndex
CREATE INDEX "social_audit_content_idx" ON "social_audit_logs"("contentItemId");

-- AddForeignKey
ALTER TABLE "social_content_items" ADD CONSTRAINT "social_content_items_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_content_items" ADD CONSTRAINT "social_content_items_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "social_content_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_content_assets" ADD CONSTRAINT "social_content_assets_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "social_content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_publications" ADD CONSTRAINT "social_publications_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "social_content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_publications" ADD CONSTRAINT "social_publications_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_content_analytics_snapshots" ADD CONSTRAINT "social_content_analytics_snapshots_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "social_content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_account_analytics_snapshots" ADD CONSTRAINT "social_account_analytics_snapshots_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_ai_recommendations" ADD CONSTRAINT "social_ai_recommendations_topPostContentItemId_fkey" FOREIGN KEY ("topPostContentItemId") REFERENCES "social_content_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_agent_tasks" ADD CONSTRAINT "social_agent_tasks_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "social_agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_agent_tasks" ADD CONSTRAINT "social_agent_tasks_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "social_content_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_audit_logs" ADD CONSTRAINT "social_audit_logs_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_audit_logs" ADD CONSTRAINT "social_audit_logs_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "social_content_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ADR-3: at-most-once publish backstop. Even if the application-level
-- conditional-UPDATE claim (SocialContentItem.lockedAt) were ever bypassed by
-- a bug, Postgres itself refuses a second SUCCEEDED publication row for the
-- same content item. Mirrors this repo's existing partial-unique-index
-- precedent (season_one_active_per_category, documented in schema.prisma).
CREATE UNIQUE INDEX "social_publication_one_success_per_item" ON "social_publications" ("contentItemId") WHERE "status" = 'SUCCEEDED';

-- ADR-3 / AC-47: weekly-strategy job idempotency backstop — one WEEKLY_STRATEGY
-- agent run per ISO week, enforced at the database level (in addition to the
-- SocialAIRecommendation.isoWeek unique constraint above).
CREATE UNIQUE INDEX "social_agent_run_one_weekly_strategy_per_week" ON "social_agent_runs" ("isoWeek") WHERE "kind" = 'WEEKLY_STRATEGY';
