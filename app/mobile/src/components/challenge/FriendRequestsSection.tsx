import { useCallback, useEffect, useState } from "react";
import { climberDisplay } from "@app/lib/handle";
import { UsernameHandle } from "@app/components/Challenge/UsernameHandle";
import { apiFetch } from "../../lib/api";
import { notifyError, notifySuccess } from "../../lib/haptics";
import { Button, Card } from "../ui";

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
  const [error, setError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/friends/requests");
      if (res.ok) {
        const data = (await res.json()) as {
          incoming: FriendRequest[];
          outgoing: OutgoingRequest[];
        };
        setIncoming(data.incoming);
        setOutgoing(data.outgoing);
      } else {
        setError("Could not load friend requests.");
      }
    } catch {
      setError("Network error loading friend requests.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchRequests, refreshKey]);

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
        const res = await apiFetch(`/api/friends/${id}/accept`, { method: "POST" });
        if (res.ok) {
          setIncoming((prev) => prev.filter((r) => r.id !== id));
          void notifySuccess();
          onAccepted?.();
        } else {
          setActionErrors((prev) => ({ ...prev, [id]: "Could not accept. Try again." }));
          void notifyError();
        }
      } catch {
        setActionErrors((prev) => ({ ...prev, [id]: "Network error. Try again." }));
        void notifyError();
      }
      setAcceptingId(null);
    },
    [onAccepted, clearActionError],
  );

  const handleDecline = useCallback(
    async (id: string) => {
      setDecliningId(id);
      clearActionError(id);
      try {
        const res = await apiFetch(`/api/friends/${id}/decline`, { method: "POST" });
        if (res.ok) {
          setIncoming((prev) => prev.filter((r) => r.id !== id));
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
        const res = await apiFetch(`/api/friends/${id}`, { method: "DELETE" });
        if (res.ok) {
          setOutgoing((prev) => prev.filter((r) => r.id !== id));
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
      <p className="py-2 text-center font-mono text-xs text-text-muted" aria-live="polite">
        Loading requests…
      </p>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-2" role="alert">
        <p className="text-sm text-ember">{error}</p>
        <Button variant="ghost" fullWidth={false} onPress={fetchRequests}>
          Retry
        </Button>
      </div>
    );
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
            const name = climberDisplay(req.sender.id, req.sender.displayName);
            return (
              <Card key={req.id} highlight>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary">{name}</p>
                    <UsernameHandle username={req.sender.username} />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="primary"
                      fullWidth={false}
                      busy={acceptingId === req.id}
                      disabled={busyId !== null && busyId !== req.id}
                      onPress={() => handleAccept(req.id)}
                    >
                      Accept
                    </Button>
                    <Button
                      variant="ghost"
                      fullWidth={false}
                      busy={decliningId === req.id}
                      disabled={busyId !== null && busyId !== req.id}
                      onPress={() => handleDecline(req.id)}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
                {actionErrors[req.id] && (
                  <p className="mt-2 font-mono text-xs text-ember" role="alert">
                    {actionErrors[req.id]}
                  </p>
                )}
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
            const name = climberDisplay(req.receiver.id, req.receiver.displayName);
            return (
              <Card key={req.id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-text-secondary">{name}</p>
                    <UsernameHandle username={req.receiver.username} />
                  </div>
                  <Button
                    variant="ghost"
                    fullWidth={false}
                    busy={cancelingId === req.id}
                    disabled={busyId !== null && busyId !== req.id}
                    onPress={() => handleCancel(req.id)}
                  >
                    Cancel
                  </Button>
                </div>
                {actionErrors[req.id] && (
                  <p className="mt-2 font-mono text-xs text-ember" role="alert">
                    {actionErrors[req.id]}
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
