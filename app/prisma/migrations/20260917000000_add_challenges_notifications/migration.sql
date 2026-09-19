-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('pending', 'accepted', 'declined', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('challenge_received', 'challenge_accepted', 'challenge_declined', 'challenge_expired', 'duel_result', 'system');

-- CreateTable
CREATE TABLE "challenges" (
    "id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "category_slug" TEXT NOT NULL,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'pending',
    "duel_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "challenge_sender_status_idx" ON "challenges"("sender_id", "status");

-- CreateIndex
CREATE INDEX "challenge_recipient_status_idx" ON "challenges"("recipient_id", "status");

-- CreateIndex
CREATE INDEX "challenge_expires_at_idx" ON "challenges"("expires_at");

-- CreateIndex
CREATE INDEX "notification_user_read_idx" ON "notifications"("user_id", "read", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
