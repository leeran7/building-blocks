-- Add new notification type enum values
ALTER TYPE "NotificationType" ADD VALUE 'duel_rematch';
ALTER TYPE "NotificationType" ADD VALUE 'tournament_started';
ALTER TYPE "NotificationType" ADD VALUE 'tournament_round_ready';
ALTER TYPE "NotificationType" ADD VALUE 'tournament_complete';
ALTER TYPE "NotificationType" ADD VALUE 'daily_chips';
