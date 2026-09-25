import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { climberDisplay } from "@app/lib/handle";
import { UsernameHandle } from "@app/components/Challenge/UsernameHandle";
import { apiFetch } from "../../lib/api";
import { notifyError } from "../../lib/haptics";
import { Button, Card } from "../ui";

interface ChallengeItem {
  id: string;
  senderId: string;
  recipientId: string;
  categorySlug: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  sender: { id: string; displayName: string | null; username: string | null; avatarId?: string | null };
  recipient: { id: string; displayName: string | null; username: string | null; avatarId?: string | null };
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

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() - Date.now() <= 0;
}

export interface PendingChallengesSectionProps {
  /** Bump this to force a refetch (e.g. after sending a new challenge). */
  refreshKey?: number;
}

/** Incoming (accept/decline) and outgoing (cancel) in-app challenge invitations. */
export function PendingChallengesSection({ refreshKey }: PendingChallengesSectionProps = {}) {
  const navigate = useNavigate();
  const [challenges, setChallenges] = useState<ChallengeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  const fetchChallenges = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/challenge");
      if (res.ok) {
        const data = (await res.json()) as ChallengeItem[];
        setChallenges(data);
      } else {
        setError("Could not load challenges.");
      }
    } catch {
      setError("Network error loading challenges.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchChallenges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchChallenges, refreshKey]);

  const clearActionError = useCallback((id: string) => {
    setActionErrors((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const busyId = acceptingId ?? decliningId ?? cancelingId;

  const handleAccept = useCallback(
    async (id: string) => {
      setAcceptingId(id);
      clearActionError(id);
      try {
        const res = await apiFetch(`/api/challenge/${id}/accept`, { method: "POST" });
        if (res.ok) {
          const data = (await res.json()) as { duelId: string };
          navigate(`/duel/${data.duelId}`);
          return;
        }
        setActionErrors((prev) => ({ ...prev, [id]: "Could not accept. Try again." }));
        void notifyError();
      } catch {
        setActionErrors((prev) => ({ ...prev, [id]: "Network error. Try again." }));
        void notifyError();
      }
      setAcceptingId(null);
    },
    [navigate, clearActionError],
  );

  const handleDecline = useCallback(
    async (id: string) => {
      setDecliningId(id);
      clearActionError(id);
      try {
        const res = await apiFetch(`/api/challenge/${id}/decline`, { method: "POST" });
        if (res.ok) {
          setChallenges((prev) => prev.filter((c) => c.id !== id));
        } else {
          setActionErrors((prev) => ({ ...prev, [id]: "Could not decline. Try again." }));
          void notifyError();
        }
      } catch {
        setActionErrors((prev) => ({ ...prev, [id]: "Network error. Try again." }));
        void notifyError();
      }
      setDecliningId(null);
    },
    [clearActionError],
  );

  const handleCancel = useCallback(
    async (id: string) => {
      setCancelingId(id);
      clearActionError(id);
      try {
        const res = await apiFetch(`/api/challenge/${id}/cancel`, { method: "POST" });
        if (res.ok) {
          setChallenges((prev) => prev.filter((c) => c.id !== id));
        } else {
          setActionErrors((prev) => ({ ...prev, [id]: "Could not cancel. Try again." }));
          void notifyError();
        }
      } catch {
        setActionErrors((prev) => ({ ...prev, [id]: "Network error. Try again." }));
        void notifyError();
      }
      setCancelingId(null);
    },
    [clearActionError],
  );

  if (loading) {
    return (
      <p className="py-2 text-center font-mono text-meta text-text-muted" aria-live="polite">
        Loading challenges…
      </p>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-2" role="alert">
        <p className="text-meta leading-5 text-ember">{error}</p>
        <Button variant="ghost" fullWidth={false} onPress={fetchChallenges}>
          Retry
        </Button>
      </div>
    );
  }

  if (challenges.length === 0) return null;

  const received = challenges.filter((c) => c.direction === "received");
  const sent = challenges.filter((c) => c.direction === "sent");

  return (
    <div className="flex flex-col gap-4">
      {received.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="font-mono text-label uppercase tracking-label text-text-secondary">
            Incoming challenges
          </h2>
          {received.map((c) => {
            const name = climberDisplay(c.sender.id, c.sender.displayName, c.sender.avatarId);
            const expired = isExpired(c.expiresAt);
            return (
              <Card key={c.id} highlight>
                {/* Name on its own line, actions stacked below: side by side, the
                    two buttons left the name about 12px at 320px. */}
                <div className="flex flex-col gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-balance text-body font-semibold text-text-primary">
                      {name} challenged you
                    </p>
                    <UsernameHandle username={c.sender.username} sizeClass="text-meta" />
                    <p className="mt-0.5 font-mono text-meta text-text-muted">
                      {timeLeft(c.expiresAt)}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="primary"
                      busy={acceptingId === c.id}
                      disabled={(busyId !== null && busyId !== c.id) || expired}
                      onPress={() => handleAccept(c.id)}
                    >
                      Accept
                    </Button>
                    <Button
                      variant="secondary"
                      busy={decliningId === c.id}
                      disabled={busyId !== null && busyId !== c.id}
                      onPress={() => handleDecline(c.id)}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
                {actionErrors[c.id] && (
                  <p className="mt-2 font-mono text-meta text-ember" role="alert">
                    {actionErrors[c.id]}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {sent.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="font-mono text-label uppercase tracking-label text-text-secondary">
            Sent challenges
          </h2>
          {sent.map((c) => {
            const name = climberDisplay(c.recipient.id, c.recipient.displayName, c.recipient.avatarId);
            return (
              <Card key={c.id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-balance text-body text-text-secondary">
                      Waiting for <span className="font-semibold text-text-primary">{name}</span>
                    </p>
                    <UsernameHandle username={c.recipient.username} sizeClass="text-meta" />
                    <p className="mt-0.5 font-mono text-meta text-text-muted">
                      {timeLeft(c.expiresAt)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    fullWidth={false}
                    busy={cancelingId === c.id}
                    disabled={busyId !== null && busyId !== c.id}
                    onPress={() => handleCancel(c.id)}
                  >
                    Cancel
                  </Button>
                </div>
                {actionErrors[c.id] && (
                  <p className="mt-2 font-mono text-meta text-ember" role="alert">
                    {actionErrors[c.id]}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
