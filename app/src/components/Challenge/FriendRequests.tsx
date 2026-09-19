"use client";

/**
 * FriendRequests -- incoming friend requests (accept / decline) and outgoing
 * requests (cancel). Fetches GET /api/friends/requests on mount.
 *
 * Returns null when both lists are empty so the parent layout collapses
 * cleanly.
 *
 * States: loading, empty (null), populated, per-item actioning.
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { authedFetch } from "../../lib/authedFetch";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";

interface FriendRequest {
  id: string;
  sender: { id: string; displayName: string | null; username: string | null };
  createdAt: string;
}

interface OutgoingRequest {
  id: string;
  receiver: { id: string; displayName: string | null; username: string | null };
  createdAt: string;
}

interface RequestsPayload {
  incoming: FriendRequest[];
  outgoing: OutgoingRequest[];
}

export function FriendRequests() {
  const { token } = useAuth();
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    if (!token) return;
    try {
      const res = await authedFetch("/api/friends/requests", token);
      if (res.ok) {
        const data = (await res.json()) as RequestsPayload;
        setIncoming(data.incoming);
        setOutgoing(data.outgoing);
      }
    } catch {
      // Silently fail -- the section simply won't render.
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // ---- Actions ----

  const handleAccept = useCallback(
    async (id: string) => {
      if (!token) return;
      setActioning(id);
      try {
        const res = await authedFetch(`/api/friends/${id}/accept`, token, {
          method: "POST",
        });
        if (res.ok) {
          setIncoming((prev) => prev.filter((r) => r.id !== id));
        }
      } catch {
        // Best-effort -- leave the item visible so the user can retry.
      }
      setActioning(null);
    },
    [token]
  );

  const handleDecline = useCallback(
    async (id: string) => {
      if (!token) return;
      setActioning(id);
      try {
        const res = await authedFetch(`/api/friends/${id}/decline`, token, {
          method: "POST",
        });
        if (res.ok) {
          setIncoming((prev) => prev.filter((r) => r.id !== id));
        }
      } catch {
        // Best-effort.
      }
      setActioning(null);
    },
    [token]
  );

  const handleCancel = useCallback(
    async (id: string) => {
      if (!token) return;
      setActioning(id);
      try {
        const res = await authedFetch(`/api/friends/${id}`, token, {
          method: "DELETE",
        });
        if (res.ok) {
          setOutgoing((prev) => prev.filter((r) => r.id !== id));
        }
      } catch {
        // Best-effort.
      }
      setActioning(null);
    },
    [token]
  );

  // ---- Render ----

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-text-muted text-sm py-2">
        <Spinner /> Loading requests...
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
              const name =
                req.sender.displayName ?? req.sender.username ?? "Someone";
              return (
                <div
                  key={req.id}
                  className="rounded-lg border border-signal/30 bg-signal/5 p-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">
                      {name}
                    </p>
                    {req.sender.displayName && req.sender.username && (
                      <p className="text-xs text-text-muted truncate">
                        @{req.sender.username}
                      </p>
                    )}
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
              const name =
                req.receiver.displayName ??
                req.receiver.username ??
                "Someone";
              return (
                <div
                  key={req.id}
                  className="rounded-lg border border-border-subtle bg-surface p-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-text-secondary truncate">
                      {name}
                    </p>
                    {req.receiver.displayName && req.receiver.username && (
                      <p className="text-xs text-text-muted truncate">
                        @{req.receiver.username}
                      </p>
                    )}
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
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
