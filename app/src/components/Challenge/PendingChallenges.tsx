"use client";

/**
 * PendingChallenges — shows incoming and outgoing challenge invitations.
 *
 * Renders nothing while empty, and nothing during the first read either: a
 * loading row that showed and then vanished made the page jump on every
 * visit. A revisit paints the last list at once (sessionCache) and refreshes
 * behind it.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { authedFetch } from "../../lib/authedFetch";
import { readSessionCache, writeSessionCache } from "../../lib/sessionCache";
import { climberDisplay } from "../../lib/handle";
import { Button } from "../ui/Button";
import { UsernameHandle } from "./UsernameHandle";

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

export interface PendingChallengesProps {
  /** Bump this to force a refetch (e.g. after sending a new challenge). */
  refreshKey?: number;
}

const CHALLENGES_KEY = "pending-challenges";

export function PendingChallenges({ refreshKey }: PendingChallengesProps = {}) {
  const { user, token } = useAuth();
  const uid = user?.uid ?? null;
  const router = useRouter();
  const [cached] = useState(() => readSessionCache<ChallengeItem[]>(uid, CHALLENGES_KEY));
  const [challenges, setChallenges] = useState<ChallengeItem[]>(cached ?? []);
  // Only the first read is "loading": a refresh keeps the current list up.
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  const fetchChallenges = useCallback(async () => {
    if (!token) return;
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

  // Declining and cancelling edit the list in place; keep the cached copy in
  // step so a revisit doesn't paint rows that are gone.
  useEffect(() => {
    if (!loading && !error) writeSessionCache(uid, CHALLENGES_KEY, challenges);
  }, [uid, loading, error, challenges]);

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

  if (loading) return null;

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
              const name = climberDisplay(c.sender.id, c.sender.displayName, c.sender.avatarId);
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
                      <UsernameHandle username={c.sender.username} />
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
              const name = climberDisplay(c.recipient.id, c.recipient.displayName, c.recipient.avatarId);
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
                      <UsernameHandle username={c.recipient.username} />
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
