"use client";

import { useCallback, useEffect, useState } from "react";
import { useSocialApi } from "../../../../src/components/Social/useSocialApi";

interface ContentItem {
  id: string;
  platform: string;
  title: string | null;
  hook: string | null;
  caption: string | null;
  status: string;
  blockedByAvoidTerm: boolean;
}

export default function ApprovalsPage() {
  const { request } = useSocialApi();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(() => {
    request<{ items: ContentItem[] }>("/api/social/content?status=READY_FOR_REVIEW")
      .then((data: { items: ContentItem[] }) => setItems(data.items))
      .catch((err: Error) => setError(err.message));
  }, [request]);

  useEffect(() => {
    load();
  }, [load]);

  async function approve(id: string) {
    setActing(id);
    try {
      await request(`/api/social/content/${id}/approve`, { method: "POST", body: "{}" });
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActing(null);
    }
  }

  async function reject(id: string) {
    const reason = window.prompt("Rejection reason (optional):") ?? undefined;
    setActing(id);
    try {
      await request(`/api/social/content/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl tracking-tight">Approval Queue</h1>
        <p className="text-text-muted text-sm mt-1">Review AI-generated drafts before scheduling or publishing.</p>
      </header>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="space-y-4">
        {items.length === 0 ? (
          <p className="text-text-muted text-sm">Nothing awaiting approval.</p>
        ) : (
          items.map((item) => (
            <article key={item.id} className="rounded-xl border border-border bg-elevated p-5 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="font-mono text-xs text-text-muted">{item.platform}</span>
                  <h2 className="font-semibold">{item.title ?? item.hook ?? "Untitled"}</h2>
                  {item.caption && <p className="text-sm text-text-muted mt-1 line-clamp-3">{item.caption}</p>}
                  {item.blockedByAvoidTerm && (
                    <p className="text-amber-400 text-xs mt-2">⚠ Contains avoid-listed terms — cannot approve until edited.</p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    type="button"
                    disabled={acting === item.id || item.blockedByAvoidTerm}
                    onClick={() => approve(item.id)}
                    className="rounded-full bg-signal px-4 py-1.5 text-xs font-semibold text-void disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={acting === item.id}
                    onClick={() => reject(item.id)}
                    className="rounded-full border border-border px-4 py-1.5 text-xs text-text-muted hover:text-text-primary disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
