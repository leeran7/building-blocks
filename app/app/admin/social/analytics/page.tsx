"use client";

import { useCallback, useEffect, useState } from "react";
import { useSocialApi } from "../../../../src/components/Social/useSocialApi";

export default function AnalyticsPage() {
  const { request } = useSocialApi();
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    request("/api/social/analytics")
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [request]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await request("/api/social/reports/weekly/generate", { method: "POST", body: "{}" });
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl tracking-tight">Analytics</h1>
          <p className="text-text-muted text-sm mt-1">Stored snapshots from connected platforms. Missing metrics show as null — never fabricated.</p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="rounded-full border border-border px-4 py-2 text-xs font-mono uppercase tracking-wide text-text-muted hover:text-text-primary disabled:opacity-50"
        >
          {refreshing ? "Running…" : "Run weekly strategy"}
        </button>
      </header>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {data ? (
        <pre className="rounded-xl border border-border bg-void p-4 text-xs overflow-auto max-h-[32rem] font-mono text-text-muted">
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <p className="text-text-muted text-sm">Loading analytics…</p>
      )}
    </div>
  );
}
