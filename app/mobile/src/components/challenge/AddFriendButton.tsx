import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { notifySuccess } from "../../lib/haptics";
import { Button } from "../ui";

type Status = "loading" | "not_friend" | "pending" | "friends" | "sent" | "error";

export interface AddFriendButtonProps {
  opponentId: string;
  opponentName: string;
}

/**
 * Post-duel "add as friend" prompt. Checks friendship status on mount and
 * offers to send a request. Renders nothing once already friends.
 */
export function AddFriendButton({ opponentId, opponentName }: AddFriendButtonProps) {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/friends/status?userId=${encodeURIComponent(opponentId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { status: string } | null) => {
        if (cancelled) return;
        if (!data) { setStatus("not_friend"); return; }
        if (data.status === "accepted") setStatus("friends");
        else if (data.status === "pending") setStatus("pending");
        else setStatus("not_friend");
      })
      .catch(() => { if (!cancelled) setStatus("not_friend"); });
    return () => { cancelled = true; };
  }, [opponentId]);

  const handleAdd = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await apiFetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiverId: opponentId }),
      });
      if (res.ok) {
        setStatus("sent");
        void notifySuccess();
      } else {
        const body = (await res.json().catch(() => ({}))) as { code?: string };
        if (body.code === "already_friends") setStatus("friends");
        else if (body.code === "already_pending") setStatus("pending");
        else setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }, [opponentId]);

  if (status === "friends") return null;

  if (status === "sent") {
    return (
      <p
        className="text-center font-mono text-xs uppercase tracking-[0.12em] text-signal"
        aria-live="polite"
      >
        Friend request sent to {opponentName}
      </p>
    );
  }

  if (status === "pending") {
    return (
      <p className="text-center font-mono text-xs uppercase tracking-[0.12em] text-text-muted">
        Friend request pending
      </p>
    );
  }

  return (
    <Button variant="secondary" busy={status === "loading"} onPress={handleAdd}>
      {status === "error" ? "Try again" : `Add ${opponentName} as friend`}
    </Button>
  );
}
