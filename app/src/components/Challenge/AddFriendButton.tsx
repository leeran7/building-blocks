"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { authedFetch } from "../../lib/authedFetch";

type Status = "loading" | "not_friend" | "pending" | "friends" | "sent" | "error";

interface AddFriendButtonProps {
  opponentId: string;
  opponentName: string;
}

export function AddFriendButton({ opponentId, opponentName }: AddFriendButtonProps) {
  const { token } = useAuth();
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    authedFetch(`/api/friends/status?userId=${encodeURIComponent(opponentId)}`, token)
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
  }, [token, opponentId]);

  const handleAdd = useCallback(async () => {
    if (!token) return;
    setStatus("loading");
    try {
      const res = await authedFetch("/api/friends", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiverId: opponentId }),
      });
      if (res.ok) {
        setStatus("sent");
      } else {
        const body = (await res.json().catch(() => ({}))) as { code?: string };
        if (body.code === "already_friends") setStatus("friends");
        else if (body.code === "already_pending") setStatus("pending");
        else setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }, [token, opponentId]);

  if (status === "loading" || status === "friends") return null;

  if (status === "sent") {
    return (
      <p className="text-center font-mono text-xs text-signal uppercase tracking-[0.12em]">
        Friend request sent to {opponentName}
      </p>
    );
  }

  if (status === "pending") {
    return (
      <p className="text-center font-mono text-xs text-text-muted uppercase tracking-[0.12em]">
        Friend request pending
      </p>
    );
  }

  return (
    <button
      onClick={handleAdd}
      className="inline-flex items-center justify-center rounded-full px-6 min-h-[44px] w-full border border-border-strong text-text-secondary text-sm hover:border-signal/50 hover:text-signal transition-colors"
    >
      Add {opponentName} as friend
    </button>
  );
}
