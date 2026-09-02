-- Durable record of captured Stripe payments we could not attribute.
-- The webhook acknowledges these with HTTP 200 so Stripe does not retry a
-- deterministic miss; this row is the replay queue that console.error was not.

CREATE TABLE "payment_dead_letters" (
    "id" TEXT NOT NULL,
    "stripe_session_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_dead_letters_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_dead_letters_stripe_session_id_idx" ON "payment_dead_letters"("stripe_session_id");
