import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../lib/api";
import { notifyError, tapMedium } from "../../lib/haptics";
import { Card } from "../ui";

interface ChallengeItem {
  id: string;
  senderId: string;
  recipientId: string;
  categorySlug: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  sender: { id: string; displayName: string | null; username: string | null };
  recipient: { id: string; displayName: string | null; username: string | null };
  direction: "sent" | "received";
}

function timeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

/** Incoming (accept/decline) and outgoing (cancel) in-app challenge invitations. */
export function PendingChallengesSection() {
  const navigate = useNavigate();
  const [challenges, setChallenges] = useState<ChallengeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);

  const fetchChallenges = useCallback(async () => {
    try {
      const res = await apiFetch("/api/challenge");
      if (res.ok) {
        const data = (await res.json()) as ChallengeItem[];
        setChallenges(data);
      }
    } catch {
      /* section simply won't render */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchChallenges();
  }, [fetchChallenges]);

  const handleAccept = useCallback(
    async (id: string) => {
      void tapMedium();
      setActioning(id);
      try {
        const res = await apiFetch(`/api/challenge/${id}/accept`, { method: "POST" });
        if (res.ok) {
          const data = (await res.json()) as { duelId: string };
          navigate(`/duel/${data.duelId}`);
          return;
        }
        void notifyError();
      } catch {
        void notifyError();
      }
      setActioning(null);
    },
    [navigate],
  );

  const handleDecline = useCallback(async (id: string) => {
    setActioning(id);
    try {
      const res = await apiFetch(`/api/challenge/${id}/decline`, { method: "POST" });
      if (res.ok) setChallenges((prev) => prev.filter((c) => c.id !== id));
    } catch {
      /* best-effort */
    }
    setActioning(null);
  }, []);

  const handleCancel = useCallback(async (id: string) => {
    setActioning(id);
    try {
      const res = await apiFetch(`/api/challenge/${id}/cancel`, { method: "POST" });
      if (res.ok) setChallenges((prev) => prev.filter((c) => c.id !== id));
    } catch {
      /* best-effort */
    }
    setActioning(null);
  }, []);

  if (loading || challenges.length === 0) return null;

  const received = challenges.filter((c) => c.direction === "received");
  const sent = challenges.filter((c) => c.direction === "sent");

  return (
    <div className="flex flex-col gap-4">
      {received.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
            Incoming challenges
          </h2>
          {received.map((c) => {
            const name = c.sender.displayName ?? c.sender.username ?? "Someone";
            return (
              <Card key={c.id} highlight>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {name} challenged you
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-text-muted">
                      {timeLeft(c.expiresAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      disabled={actioning === c.id}
                      onClick={() => handleAccept(c.id)}
                      className="font-mono text-xs uppercase tracking-[0.12em] text-signal disabled:text-text-muted"
                    >
                      {actioning === c.id ? "…" : "Accept"}
                    </button>
                    <button
                      type="button"
                      disabled={actioning === c.id}
                      onClick={() => handleDecline(c.id)}
                      className="font-mono text-xs uppercase tracking-[0.12em] text-text-muted"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {sent.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
            Sent challenges
          </h2>
          {sent.map((c) => {
            const name = c.recipient.displayName ?? c.recipient.username ?? "Someone";
            return (
              <Card key={c.id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-text-secondary">
                      Waiting for <span className="font-semibold text-text-primary">{name}</span>
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-text-muted">
                      {timeLeft(c.expiresAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={actioning === c.id}
                    onClick={() => handleCancel(c.id)}
                    className="shrink-0 font-mono text-xs uppercase tracking-[0.12em] text-text-muted"
                  >
                    Cancel
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
