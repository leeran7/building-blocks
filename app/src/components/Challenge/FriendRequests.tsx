"use client";

/**
 * FriendRequests -- incoming friend requests (accept / decline) and outgoing
 * requests (cancel). Fetches GET /api/friends/requests on mount.
 *
 * Returns null when both lists are empty (and there's no error) so the
 * parent layout collapses cleanly. The first read renders nothing too, rather
 * than a loading row: the lists are usually empty, so a row that showed and
 * then vanished made the page jump on every visit. A revisit paints the last
 * lists at once (sessionCache) and refreshes behind them.
 *
 * States: loading (null), error (message + retry), empty (null), populated,
 * per-item actioning.
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { authedFetch } from "../../lib/authedFetch";
import { readSessionCache, writeSessionCache } from "../../lib/sessionCache";
import { climberDisplay } from "../../lib/handle";
import { Button } from "../ui/Button";
import { UsernameHandle } from "./UsernameHandle";

interface FriendRequest {
  id: string;
  sender: { id: string; displayName: string | null; username: string | null; avatarId?: string | null };
  createdAt: string;
}

interface OutgoingRequest {
  id: string;
  receiver: { id: string; displayName: string | null; username: string | null; avatarId?: string | null };
  createdAt: string;
}

interface RequestsPayload {
  incoming: FriendRequest[];
  outgoing: OutgoingRequest[];
}

export interface FriendRequestsProps {
  /** Bump this to force a refetch (e.g. after a request is sent from search). */
  refreshKey?: number;
  /** Fired when an incoming request is accepted, so the parent can refresh the friends list. */
  onAccepted?: () => void;
}

const REQUESTS_KEY = "friend-requests";

export function FriendRequests({ refreshKey, onAccepted }: FriendRequestsProps = {}) {
  const { user, token } = useAuth();
  const uid = user?.uid ?? null;
  const [cached] = useState(() => readSessionCache<RequestsPayload>(uid, REQUESTS_KEY));
  const [incoming, setIncoming] = useState<FriendRequest[]>(cached?.incoming ?? []);
  const [outgoing, setOutgoing] = useState<OutgoingRequest[]>(cached?.outgoing ?? []);
  // Only the first read is "loading": a refresh keeps the current lists up.
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  const fetchRequests = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const res = await authedFetch("/api/friends/requests", token);
      if (res.ok) {
        const data = (await res.json()) as RequestsPayload;
        setIncoming(data.incoming);
        setOutgoing(data.outgoing);
      } else {
        setError("Could not load friend requests.");
      }
    } catch {
      setError("Network error loading friend requests.");
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchRequests, refreshKey]);

  // Accepting, declining and cancelling edit the lists in place; keep the
  // cached copy in step so a revisit doesn't paint rows that are gone.
  useEffect(() => {
    if (!loading && !error) writeSessionCache(uid, REQUESTS_KEY, { incoming, outgoing });
  }, [uid, loading, error, incoming, outgoing]);

  const clearActionError = useCallback((id: string) => {
    setActionErrors((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // ---- Actions ----

  const handleAccept = useCallback(
    async (id: string) => {
      if (!token) return;
      setActioning(id);
      clearActionError(id);
      try {
        const res = await authedFetch(`/api/friends/${id}/accept`, token, {
          method: "POST",
        });
        if (res.ok) {
          setIncoming((prev) => prev.filter((r) => r.id !== id));
          onAccepted?.();
        } else {
          setActionErrors((prev) => ({ ...prev, [id]: "Could not accept. Try again." }));
        }
      } catch {
        setActionErrors((prev) => ({ ...prev, [id]: "Network error. Try again." }));
      }
      setActioning(null);
    },
    [token, onAccepted, clearActionError]
  );

  const handleDecline = useCallback(
    async (id: string) => {
      if (!token) return;
      setActioning(id);
      clearActionError(id);
      try {
        const res = await authedFetch(`/api/friends/${id}/decline`, token, {
          method: "POST",
        });
        if (res.ok) {
          setIncoming((prev) => prev.filter((r) => r.id !== id));
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
        const res = await authedFetch(`/api/friends/${id}`, token, {
          method: "DELETE",
        });
        if (res.ok) {
          setOutgoing((prev) => prev.filter((r) => r.id !== id));
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

  // ---- Render ----

  if (loading) return null;

  if (error) {
    return (
      <div className="flex flex-col gap-2" role="alert">
        <p className="text-ember text-sm">{error}</p>
        <Button variant="ghost" size="sm" onClick={fetchRequests} className="w-fit">
          Retry
        </Button>
      </div>
    );
  }

  if (incoming.length === 0 && outgoing.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {incoming.length > 0 && (
        <div>
          <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted mb-2">
            Friend requests
          </h3>
          <div className="flex flex-col gap-2">
            {incoming.map((req) => {
              const name = climberDisplay(req.sender.id, req.sender.displayName, req.sender.avatarId);
              return (
                <div
                  key={req.id}
                  className="rounded-lg border border-signal/30 bg-signal/5 p-3 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">
                        {name}
                      </p>
                      <UsernameHandle username={req.sender.username} />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleAccept(req.id)}
                        disabled={actioning === req.id}
                      >
                        {actioning === req.id ? "…" : "Accept"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDecline(req.id)}
                        disabled={actioning === req.id}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                  {actionErrors[req.id] && (
                    <p className="text-ember text-xs" role="alert">
                      {actionErrors[req.id]}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {outgoing.length > 0 && (
        <div>
          <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted mb-2">
            Sent requests
          </h3>
          <div className="flex flex-col gap-2">
            {outgoing.map((req) => {
              const name = climberDisplay(req.receiver.id, req.receiver.displayName, req.receiver.avatarId);
              return (
                <div
                  key={req.id}
                  className="rounded-lg border border-border-subtle bg-surface p-3 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-text-secondary truncate">
                        {name}
                      </p>
                      <UsernameHandle username={req.receiver.username} />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancel(req.id)}
                      disabled={actioning === req.id}
                    >
                      Cancel
                    </Button>
                  </div>
                  {actionErrors[req.id] && (
                    <p className="text-ember text-xs" role="alert">
                      {actionErrors[req.id]}
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
