"use client";

import { useState } from "react";
import { useSocialApi } from "../../../../src/components/Social/useSocialApi";

const PLATFORMS = ["TIKTOK", "X", "YOUTUBE"] as const;

export default function ContentStudioPage() {
  const { request } = useSocialApi();
  const [prompt, setPrompt] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(["TIKTOK", "X"]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  function togglePlatform(p: string) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await request("/api/social/content/generate", {
        method: "POST",
        body: JSON.stringify({ prompt, platforms }),
      });
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
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

      {result ? (
        <pre className="rounded-xl border border-border bg-void p-4 text-xs overflow-auto max-h-96 font-mono text-text-muted">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
