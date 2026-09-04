-- AI-generated video assets (OpenAI Sora job tracking + stored preview URL)
ALTER TYPE "SocialAssetStatus" ADD VALUE 'GENERATING';

ALTER TABLE "social_content_assets"
  ADD COLUMN "aiVideoJobId" TEXT,
  ADD COLUMN "storedVideoUrl" TEXT;
