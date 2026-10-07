-- Remove the AI social media admin tool (/admin/social).
--
-- The tool's pages, /api/social routes, agent and guards were deleted in the
-- same change. Drop its tables and enums. Data is intentionally NOT archived,
-- matching drop_paid_stacks and drop_saved_urls. This cannot be undone.
--
-- KEPT: saved_social_handles and the CreatorPlatform enum (creator-page social
-- chips; unrelated to the admin tool).

DROP TABLE IF EXISTS "social_accounts" CASCADE;
DROP TABLE IF EXISTS "social_oauth_states" CASCADE;
DROP TABLE IF EXISTS "social_brand_profiles" CASCADE;
DROP TABLE IF EXISTS "social_brand_profile_snapshots" CASCADE;
DROP TABLE IF EXISTS "social_automation_settings" CASCADE;
DROP TABLE IF EXISTS "social_content_items" CASCADE;
DROP TABLE IF EXISTS "social_content_assets" CASCADE;
DROP TABLE IF EXISTS "social_publications" CASCADE;
DROP TABLE IF EXISTS "social_content_analytics_snapshots" CASCADE;
DROP TABLE IF EXISTS "social_account_analytics_snapshots" CASCADE;
DROP TABLE IF EXISTS "social_ai_recommendations" CASCADE;
DROP TABLE IF EXISTS "social_agent_runs" CASCADE;
DROP TABLE IF EXISTS "social_agent_tasks" CASCADE;
DROP TABLE IF EXISTS "social_audit_logs" CASCADE;

DROP TYPE IF EXISTS "SocialPlatform";
DROP TYPE IF EXISTS "SocialAccountStatus";
DROP TYPE IF EXISTS "SocialContentType";
DROP TYPE IF EXISTS "SocialContentStatus";
DROP TYPE IF EXISTS "SocialApprovalMode";
DROP TYPE IF EXISTS "SocialAssetKind";
DROP TYPE IF EXISTS "SocialAssetStatus";
DROP TYPE IF EXISTS "SocialPublicationStatus";
DROP TYPE IF EXISTS "SocialAgentRunKind";
DROP TYPE IF EXISTS "SocialAgentRunStatus";
DROP TYPE IF EXISTS "SocialAgentTaskStatus";
DROP TYPE IF EXISTS "SocialAgentToolName";
DROP TYPE IF EXISTS "SocialAuditAction";
DROP TYPE IF EXISTS "SocialAuditResult";
