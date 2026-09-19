"use client";

/**
 * PendingChallenges — shows incoming and outgoing challenge invitations.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { authedFetch } from "../../lib/authedFetch";
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

export function PendingChallenges() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [challenges, setChallenges] = useState<ChallengeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);

  const fetchChallenges = useCallback(async () => {
    if (!token) return;
    try {
      const res = await authedFetch("/api/challenge", token);
      if (res.ok) {
        const data = (await res.json()) as ChallengeItem[];
        setChallenges(data);
      }
    } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchChallenges();
  }, [fetchChallenges]);

  const handleAccept = useCallback(
    async (id: string) => {
      if (!token) return;
      setActioning(id);
      try {
        const res = await authedFetch(`/api/challenge/${id}/accept`, token, {
          method: "POST",
        });
        if (res.ok) {
          const data = (await res.json()) as { duelId: string };
          router.push(`/duel/${data.duelId}`);
        }
      } catch {}
      setActioning(null);
    },
    [token, router]
  );

  const handleDecline = useCallback(
    async (id: string) => {
      if (!token) return;
      setActioning(id);
      try {
        const res = await authedFetch(`/api/challenge/${id}/decline`, token, {
          method: "POST",
        });
        if (res.ok) {
          setChallenges((prev) => prev.filter((c) => c.id !== id));
        }
      } catch {}
      setActioning(null);
    },
    [token]
  );

  const handleCancel = useCallback(
    async (id: string) => {
      if (!token) return;
      setActioning(id);
      try {
        const res = await authedFetch(`/api/challenge/${id}/cancel`, token, {
          method: "POST",
        });
        if (res.ok) {
          setChallenges((prev) => prev.filter((c) => c.id !== id));
        }
      } catch {}
      setActioning(null);
    },
    [token]
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-text-muted text-sm py-2">
        <Spinner /> Loading challenges…
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
              const name = c.sender.displayName ?? c.sender.username ?? "Someone";
              return (
                <div
                  key={c.id}
                  className="rounded-lg border border-signal/30 bg-signal/5 p-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">
                      {name} challenged you
                    </p>
                    <p className="text-xs text-text-muted font-mono mt-0.5">
                      {timeLeft(c.expiresAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleAccept(c.id)}
                      disabled={actioning === c.id}
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
              const name = c.recipient.displayName ?? c.recipient.username ?? "Someone";
              return (
                <div
                  key={c.id}
                  className="rounded-lg border border-border-subtle bg-surface p-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-text-secondary truncate">
                      Waiting for <span className="font-semibold text-text-primary">{name}</span>
                    </p>
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
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
