"use client";

import { useState } from "react";
import { useSocialApi } from "../../../../src/components/Social/useSocialApi";

const PLATFORMS = ["TIKTOK", "X", "YOUTUBE"] as const;

export default function ContentStudioPage() {
  const { request } = useSocialApi();
  const [prompt, setPrompt] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(["TIKTOK", "X"]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ items?: Array<{ id: string; platform: string; title: string | null; status: string }> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  function togglePlatform(p: string) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await request<{ promptBatchId: string; items: Array<{ id: string; platform: string; title: string | null; status: string }> }>(
        "/api/social/content/generate",
        {
          method: "POST",
          body: JSON.stringify({ prompt, platforms }),
        }
      );
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(id: string) {
    setSubmitting(id);
    setError(null);
    try {
      await request(`/api/social/content/${id}/submit`, { method: "POST", body: "{}" });
      setResult((prev) =>
        prev?.items
          ? {
              ...prev,
              items: prev.items.map((item) =>
                item.id === id ? { ...item, status: "READY_FOR_REVIEW" } : item
              ),
            }
          : prev
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl tracking-tight">Content Studio</h1>
        <p className="text-text-muted text-sm mt-1">One prompt → distinct platform-native drafts.</p>
      </header>

      <form onSubmit={handleGenerate} className="space-y-4 rounded-xl border border-border bg-elevated p-5">
        <div>
          <label className="block text-xs font-medium text-text-muted mb-2">Content idea</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-border bg-void px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus"
            placeholder="e.g. Show off a clutch Doomstack climb with a leaderboard comeback hook"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-text-muted mb-2">Platforms</label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => togglePlatform(p)}
                className={`rounded-full px-3 py-1 text-xs font-mono border transition-colors ${
                  platforms.includes(p)
                    ? "border-signal bg-signal/10 text-signal"
                    : "border-border text-text-muted hover:border-border-focus"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || platforms.length === 0}
          className="rounded-full bg-signal px-5 py-2 text-sm font-semibold text-void disabled:opacity-50"
        >
          {loading ? "Generating…" : "Generate drafts"}
        </button>
      </form>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {result?.items && result.items.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm">Generated drafts</h2>
          {result.items.map((item) => (
            <article key={item.id} className="rounded-xl border border-border bg-elevated p-4 flex items-center justify-between gap-4">
              <div>
                <span className="font-mono text-xs text-text-muted">{item.platform}</span>
                <p className="font-medium">{item.title ?? "Untitled draft"}</p>
                <p className="text-xs text-text-muted mt-1">{item.status}</p>
              </div>
              {item.status === "DRAFT" || item.status === "IDEA" ? (
                <button
                  type="button"
                  disabled={submitting === item.id}
                  onClick={() => handleSubmit(item.id)}
                  className="rounded-full bg-signal px-4 py-1.5 text-xs font-semibold text-void disabled:opacity-50"
                >
                  {submitting === item.id ? "Submitting…" : "Submit for review"}
                </button>
              ) : null}
            </article>
          ))}
        </section>
      ) : result ? (
        <pre className="rounded-xl border border-border bg-void p-4 text-xs overflow-auto max-h-96 font-mono text-text-muted">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
