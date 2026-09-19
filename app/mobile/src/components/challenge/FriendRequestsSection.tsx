import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { notifyError, notifySuccess, tapLight } from "../../lib/haptics";
import { Card } from "../ui";

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

export interface FriendRequestsSectionProps {
  /** Bump this to force a refetch (e.g. after a request is sent from search). */
  refreshKey?: number;
  /** Fired when an incoming request is accepted, so the parent can refresh the friends list. */
  onAccepted?: () => void;
}

/** Incoming (accept/decline) and outgoing (cancel) friend requests. Collapses when empty. */
export function FriendRequestsSection({ refreshKey, onAccepted }: FriendRequestsSectionProps) {
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await apiFetch("/api/friends/requests");
      if (res.ok) {
        const data = (await res.json()) as {
          incoming: FriendRequest[];
          outgoing: OutgoingRequest[];
        };
        setIncoming(data.incoming);
        setOutgoing(data.outgoing);
      }
    } catch {
      /* section simply won't render */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchRequests, refreshKey]);

  const handleAccept = useCallback(
    async (id: string) => {
      void tapLight();
      setActioning(id);
      try {
        const res = await apiFetch(`/api/friends/${id}/accept`, { method: "POST" });
        if (res.ok) {
          setIncoming((prev) => prev.filter((r) => r.id !== id));
          void notifySuccess();
          onAccepted?.();
        } else {
          void notifyError();
        }
      } catch {
        void notifyError();
      }
      setActioning(null);
    },
    [onAccepted],
  );

  const handleDecline = useCallback(async (id: string) => {
    void tapLight();
    setActioning(id);
    try {
      const res = await apiFetch(`/api/friends/${id}/decline`, { method: "POST" });
      if (res.ok) setIncoming((prev) => prev.filter((r) => r.id !== id));
    } catch {
      /* best-effort */
    }
    setActioning(null);
  }, []);

  const handleCancel = useCallback(async (id: string) => {
    void tapLight();
    setActioning(id);
    try {
      const res = await apiFetch(`/api/friends/${id}`, { method: "DELETE" });
      if (res.ok) setOutgoing((prev) => prev.filter((r) => r.id !== id));
    } catch {
      /* best-effort */
    }
    setActioning(null);
  }, []);

  if (loading) {
    return <p className="py-2 text-center font-mono text-xs text-text-muted">Loading requests…</p>;
  }

  if (incoming.length === 0 && outgoing.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {incoming.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
            Friend requests
          </h2>
          {incoming.map((req) => {
            const name = req.sender.displayName ?? req.sender.username ?? "Someone";
            return (
              <Card key={req.id} highlight>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary">{name}</p>
                    {req.sender.username && req.sender.displayName && (
                      <p className="truncate text-xs text-text-muted">@{req.sender.username}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      disabled={actioning === req.id}
                      onClick={() => handleAccept(req.id)}
                      className="font-mono text-xs uppercase tracking-[0.12em] text-signal disabled:text-text-muted"
                    >
                      {actioning === req.id ? "…" : "Accept"}
                    </button>
                    <button
                      type="button"
                      disabled={actioning === req.id}
                      onClick={() => handleDecline(req.id)}
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

      {outgoing.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
            Sent requests
          </h2>
          {outgoing.map((req) => {
            const name = req.receiver.displayName ?? req.receiver.username ?? "Someone";
            return (
              <Card key={req.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 flex-1 truncate text-sm text-text-secondary">{name}</p>
                  <button
                    type="button"
                    disabled={actioning === req.id}
                    onClick={() => handleCancel(req.id)}
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
