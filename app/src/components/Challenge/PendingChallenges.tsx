"use client";

/**
 * PendingChallenges — shows incoming and outgoing challenge invitations.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { authedFetch } from "../../lib/authedFetch";
import { climberDisplay } from "../../lib/handle";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";

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

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() - Date.now() <= 0;
}

export interface PendingChallengesProps {
  /** Bump this to force a refetch (e.g. after sending a new challenge). */
  refreshKey?: number;
}

export function PendingChallenges({ refreshKey }: PendingChallengesProps = {}) {
  const { token } = useAuth();
  const router = useRouter();
  const [challenges, setChallenges] = useState<ChallengeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  const fetchChallenges = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch("/api/challenge", token);
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
  }, [token]);

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

  const handleAccept = useCallback(
    async (id: string) => {
      if (!token) return;
      setActioning(id);
      clearActionError(id);
      try {
        const res = await authedFetch(`/api/challenge/${id}/accept`, token, {
          method: "POST",
        });
        if (res.ok) {
          const data = (await res.json()) as { duelId: string };
          router.push(`/duel/${data.duelId}`);
          return;
        }
        setActionErrors((prev) => ({ ...prev, [id]: "Could not accept. Try again." }));
      } catch {
        setActionErrors((prev) => ({ ...prev, [id]: "Network error. Try again." }));
      }
      setActioning(null);
    },
    [token, router, clearActionError]
  );

  const handleDecline = useCallback(
    async (id: string) => {
      if (!token) return;
      setActioning(id);
      clearActionError(id);
      try {
        const res = await authedFetch(`/api/challenge/${id}/decline`, token, {
          method: "POST",
        });
        if (res.ok) {
          setChallenges((prev) => prev.filter((c) => c.id !== id));
        } else {
          setActionErrors((prev) => ({ ...prev, [id]: "Could not decline. Try again." }));
        }
      } catch {
        setActionErrors((prev) => ({ ...prev, [id]: "Network error. Try again." }));
      }
      setActioning(null);
    },
    [token, clearActionError]
  );

  const handleCancel = useCallback(
    async (id: string) => {
      if (!token) return;
      setActioning(id);
      clearActionError(id);
      try {
        const res = await authedFetch(`/api/challenge/${id}/cancel`, token, {
          method: "POST",
        });
        if (res.ok) {
          setChallenges((prev) => prev.filter((c) => c.id !== id));
        } else {
          setActionErrors((prev) => ({ ...prev, [id]: "Could not cancel. Try again." }));
        }
      } catch {
        setActionErrors((prev) => ({ ...prev, [id]: "Network error. Try again." }));
      }
      setActioning(null);
    },
    [token, clearActionError]
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-text-muted text-sm py-2">
        <Spinner /> Loading challenges…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-2" role="alert">
        <p className="text-ember text-sm">{error}</p>
        <Button variant="ghost" size="sm" onClick={fetchChallenges} className="w-fit">
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
        <div>
          <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted mb-2">
            Incoming challenges
          </h3>
          <div className="flex flex-col gap-2">
            {received.map((c) => {
              const name = climberDisplay(c.sender.id, c.sender.displayName);
              const expired = isExpired(c.expiresAt);
              return (
                <div
                  key={c.id}
                  className="rounded-lg border border-signal/30 bg-signal/5 p-3 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">
                        {name} challenged you
                      </p>
                      {c.sender.username && (
                        <p className="text-xs text-text-muted truncate">
                          @{c.sender.username}
                        </p>
                      )}
                      <p className="text-xs text-text-muted font-mono mt-0.5">
                        {timeLeft(c.expiresAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleAccept(c.id)}
                        disabled={actioning === c.id || expired}
                      >
                        {actioning === c.id ? "…" : "Accept"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDecline(c.id)}
                        disabled={actioning === c.id}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                  {actionErrors[c.id] && (
                    <p className="text-ember text-xs" role="alert">
                      {actionErrors[c.id]}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {sent.length > 0 && (
        <div>
          <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted mb-2">
            Sent challenges
          </h3>
          <div className="flex flex-col gap-2">
            {sent.map((c) => {
              const name = climberDisplay(c.recipient.id, c.recipient.displayName);
              return (
                <div
                  key={c.id}
                  className="rounded-lg border border-border-subtle bg-surface p-3 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-text-secondary truncate">
                        Waiting for <span className="font-semibold text-text-primary">{name}</span>
                      </p>
                      {c.recipient.username && (
                        <p className="text-xs text-text-muted truncate">
                          @{c.recipient.username}
                        </p>
                      )}
                      <p className="text-xs text-text-muted font-mono mt-0.5">
                        {timeLeft(c.expiresAt)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancel(c.id)}
                      disabled={actioning === c.id}
                    >
                      Cancel
                    </Button>
                  </div>
                  {actionErrors[c.id] && (
                    <p className="text-ember text-xs" role="alert">
                      {actionErrors[c.id]}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
