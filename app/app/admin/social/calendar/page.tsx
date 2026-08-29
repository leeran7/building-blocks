"use client";

import { useEffect, useState } from "react";
import { useSocialApi } from "../../../../src/components/Social/useSocialApi";

interface ContentItem {
  id: string;
  platform: string;
  title: string | null;
  hook: string | null;
  status: string;
  scheduledAt: string | null;
}

export default function CalendarPage() {
  const { request } = useSocialApi();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    request<{ items: ContentItem[] }>("/api/social/content")
      .then((data: { items: ContentItem[] }) => setItems(data.items))
      .catch((err: Error) => setError(err.message));
  }, [request]);

  const scheduled = items.filter((i) => i.status === "SCHEDULED" || i.scheduledAt);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl tracking-tight">Calendar</h1>
        <p className="text-text-muted text-sm mt-1">Scheduled and draft content across platforms.</p>
      </header>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="rounded-xl border border-border bg-elevated overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-muted text-xs uppercase">
              <th className="px-4 py-3">Platform</th>
              <th className="px-4 py-3">Title / Hook</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Scheduled</th>
            </tr>
          </thead>
          <tbody>
            {scheduled.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-text-muted">
                  No scheduled content yet.
                </td>
              </tr>
            ) : (
              scheduled.map((item) => (
                <tr key={item.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{item.platform}</td>
                  <td className="px-4 py-3">{item.title ?? item.hook ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{item.status}</td>
                  <td className="px-4 py-3 text-text-muted">
                    {item.scheduledAt ? new Date(item.scheduledAt).toLocaleString() : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
