"use client";

/**
 * NotificationFeed — dropdown panel showing recent notifications.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { authedFetch } from "../../lib/authedFetch";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

interface NotificationFeedProps {
  onClose: () => void;
  onMarkRead: () => void;
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationFeed({ onClose, onMarkRead }: NotificationFeedProps) {
  const { token } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    authedFetch("/api/notifications?take=20", token)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.items) setItems(data.items as NotificationItem[]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const handleMarkAllRead = useCallback(async () => {
    if (!token) return;
    await authedFetch("/api/notifications", token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    onMarkRead();
  }, [token, onMarkRead]);

  const handleClick = useCallback(
    async (item: NotificationItem) => {
      if (!token) return;

      if (!item.read) {
        await authedFetch("/api/notifications", token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [item.id] }),
        }).catch(() => {});
        setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
        onMarkRead();
      }

      const data = item.data;
      if (data?.duelId) {
        router.push(`/duel/${data.duelId}`);
        onClose();
      } else if (data?.challengeId && item.type === "challenge_received") {
        router.push("/duel");
        onClose();
      }
    },
    [token, router, onClose, onMarkRead]
  );

  return (
    <div className="reveal absolute right-0 mt-2 w-80 max-h-[28rem] overflow-y-auto rounded-xl border border-border-strong bg-surface-raised shadow-lifted">
      <div className="sticky top-0 z-10 bg-surface-raised border-b border-border-subtle px-4 py-3 flex items-center justify-between">
        <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-text-muted">
          Notifications
        </h2>
        {items.some((n) => !n.read) && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="text-xs text-signal hover:underline"
          >
            Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <div className="px-4 py-8 text-center text-sm text-text-muted">Loading…</div>
      ) : items.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-text-muted">
          No notifications yet
        </div>
      ) : (
        <ul role="list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => handleClick(item)}
                className={`w-full text-left px-4 py-3 border-b border-border-subtle last:border-b-0 hover:bg-elevated transition-colors ${
                  !item.read ? "bg-signal/5" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  {!item.read && (
                    <span
                      className="mt-1.5 w-2 h-2 rounded-full bg-signal shrink-0"
                      aria-label="Unread"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-text-primary truncate">
                      {item.title}
                    </p>
                    <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">
                      {item.body}
                    </p>
                    <p className="text-[10px] text-text-muted mt-1 font-mono">
                      {timeAgo(item.createdAt)}
                    </p>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
