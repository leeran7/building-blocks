"use client";

/**
 * NotificationBell — bell icon with unread badge, opens notification feed.
 *
 * Polls /api/notifications/count every 30s for the unread count. The badge
 * shows the count (capped at 9+) when > 0.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { authedFetch } from "../../lib/authedFetch";
import { NotificationFeed } from "./NotificationFeed";

export function NotificationBell() {
  const { token } = useAuth();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const fetchCount = useCallback(async () => {
    if (!token) return;
    try {
      const res = await authedFetch("/api/notifications/count", token);
      if (res.ok) {
        const data = (await res.json()) as { count: number };
        setCount(data.count);
      }
    } catch {}
  }, [token]);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleOpen = () => {
    setOpen((v) => !v);
  };

  const handleMarkRead = () => {
    setCount(0);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ""}`}
        className="relative inline-flex items-center justify-center w-10 h-10 rounded-full hover:bg-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-text-secondary"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-ember px-1 text-[10px] font-bold text-white leading-none">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <NotificationFeed
          onClose={() => setOpen(false)}
          onMarkRead={handleMarkRead}
        />
      )}
    </div>
  );
}
