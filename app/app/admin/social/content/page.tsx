"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSocialApi } from "../../../../src/components/Social/useSocialApi";
import { CapabilityCompare } from "../../../../src/components/Social/CapabilityCompare";

const PLATFORMS = ["TIKTOK", "X", "YOUTUBE"] as const;

interface ContentItem {
  id: string;
  platform: string;
  title: string | null;
  status: string;
  contentType?: string;
}

interface VideoJob {
  contentItemId: string;
  assetId?: string;
  error?: string;
}

interface VideoStatus {
  assetId: string;
  status: string;
  jobStatus?: string;
  videoUrl?: string;
  errorMessage?: string | null;
}

function isVideoPlatform(platform: string) {
  return platform === "TIKTOK" || platform === "YOUTUBE";
}

export default function ContentStudioPage() {
  const { request } = useSocialApi();
  const [prompt, setPrompt] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(["TIKTOK", "X"]);
  const [generateVideo, setGenerateVideo] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    items?: ContentItem[];
    videoJobs?: VideoJob[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState<Record<string, VideoStatus>>({});

  function togglePlatform(p: string) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  const pollVideo = useCallback(
    async (contentItemId: string) => {
      try {
        const data = await request<VideoStatus>(`/api/social/content/${contentItemId}/video`);
        setVideoStatus((prev) => ({ ...prev, [contentItemId]: data }));
        return data;
      } catch (err) {
        setVideoStatus((prev) => ({
          ...prev,
          [contentItemId]: {
            assetId: "",
            status: "FAILED",
            errorMessage: (err as Error).message,
          },
        }));
        return null;
      }
    },
    [request]
  );

  useEffect(() => {
    if (!result?.items) return;
    const videoItems = result.items.filter((item) => isVideoPlatform(item.platform));
    if (videoItems.length === 0) return;

    let cancelled = false;
    const tick = async () => {
      for (const item of videoItems) {
        if (cancelled) return;
        const status = await pollVideo(item.id);
        if (!status || status.status === "READY" || status.status === "FAILED") continue;
      }
    };

    void tick();
    const interval = setInterval(() => {
      void tick();
    }, 12_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [result?.items, pollVideo]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setVideoStatus({});
    try {
      const data = await request<{
        promptBatchId: string;
        items: ContentItem[];
        videoJobs?: VideoJob[];
      }>("/api/social/content/generate", {
        method: "POST",
        body: JSON.stringify({ prompt, platforms, generateVideo }),
      });
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
      <header className="space-y-3">
        <div>
          <h1 className="font-display text-2xl tracking-tight">Quick Create</h1>
          <p className="text-text-secondary text-sm mt-1">
            One prompt → platform-native copy and optional AI-generated videos. For
            replay-driven content, scheduling, or publishing, use the{" "}
            <Link href="/admin/social/agent" className="text-signal underline">
              AI Assistant
            </Link>{" "}
            →
          </p>
        </div>
        <CapabilityCompare />
      </header>

      <form onSubmit={handleGenerate} className="space-y-4 rounded-xl border border-border bg-elevated p-5">
        <div>
          <label className="block text-xs font-medium text-text-muted mb-2">Content idea</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-border bg-void px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus"
            placeholder="e.g. A 15-second vertical clip showing a clutch Doomstack comeback with hype energy"
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

        <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={generateVideo}
            onChange={(e) => setGenerateVideo(e.target.checked)}
            className="rounded border-border"
          />
          Generate AI videos for TikTok / YouTube Shorts
        </label>

        <button
          type="submit"
          disabled={loading || platforms.length === 0}
          className="rounded-full bg-signal px-5 py-2 text-sm font-semibold text-void disabled:opacity-50"
        >
          {loading ? "Generating…" : "Generate"}
        </button>
      </form>

      {error && <p className="text-danger text-sm">{error}</p>}

      {result?.items && result.items.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm">Generated drafts</h2>
          {result.items.map((item) => {
            const video = videoStatus[item.id];
            const job = result.videoJobs?.find((j) => j.contentItemId === item.id);
            const showVideo = isVideoPlatform(item.platform) && generateVideo;

            return (
              <article key={item.id} className="rounded-xl border border-border bg-elevated p-4 space-y-3">
                <div className="flex items-center justify-between gap-4">
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
                </div>

                {showVideo ? (
                  <div className="rounded-lg border border-border bg-void p-3 text-xs text-text-muted space-y-2">
                    {job?.error ? (
                      <p className="text-danger">Video: {job.error}</p>
                    ) : video?.status === "READY" && video.videoUrl ? (
                      <video
                        src={video.videoUrl}
                        controls
                        className="w-full max-w-sm rounded-lg"
                        playsInline
                      />
                    ) : video?.status === "FAILED" ? (
                      <p className="text-danger">Video failed: {video.errorMessage ?? "Unknown error"}</p>
                    ) : (
                      <p>
                        Video: {video?.jobStatus ?? "queued"}… (AI video renders take a few minutes — this page polls
                        automatically)
                      </p>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : result ? (
        <pre className="rounded-xl border border-border bg-void p-4 text-xs overflow-auto max-h-96 font-mono text-text-muted">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
