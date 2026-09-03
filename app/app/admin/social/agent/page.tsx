"use client";

import { useState } from "react";
import { useSocialApi } from "../../../../src/components/Social/useSocialApi";

interface AgentTask {
  id: string;
  toolName: string | null;
  status: string;
  outputSanitized: unknown;
}

export default function AgentChatPage() {
  const { request } = useSocialApi();
  const [message, setMessage] = useState("");
  const [replayUrl, setReplayUrl] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const [toolCalls, setToolCalls] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function stepUntilDone(id: string) {
    let currentStatus = "RUNNING";
    let assistantText: string | undefined;

    while (currentStatus === "RUNNING" || currentStatus === "WAITING_ON_STEP") {
      const step = await request<{
        runId: string;
        status: string;
        assistantText?: string;
        toolCalls?: AgentTask[];
      }>(`/api/social/agent/runs/${id}/step`, { method: "POST", body: "{}" });

      currentStatus = step.status;
      assistantText = step.assistantText;
      if (step.toolCalls?.length) {
        setToolCalls((prev) => [...prev, ...step.toolCalls!]);
      }
    }

    setStatus(currentStatus);
    if (assistantText) {
      setMessages((prev) => [...prev, { role: "assistant", text: assistantText! }]);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() && !replayUrl.trim()) return;

    setLoading(true);
    setError(null);
    setToolCalls([]);
    const userText = [
      message.trim() || "Turn this climb replay into a viral short-form video.",
      replayUrl.trim() ? `Replay: ${replayUrl.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    setMessages((prev) => [...prev, { role: "user", text: userText }]);
    const userMessage = message.trim() || "Turn this climb replay into a viral short-form video.";
    setMessage("");

    try {
      const run = await request<{
        runId: string;
        status: string;
        assistantText?: string;
        toolCalls?: AgentTask[];
      }>("/api/social/agent/runs", {
        method: "POST",
        body: JSON.stringify({
          kind: "CHAT_TURN",
          message: userMessage,
          replayUrl: replayUrl.trim() || undefined,
        }),
      });

      setRunId(run.runId);
      setStatus(run.status);
      if (run.toolCalls?.length) setToolCalls(run.toolCalls);
      if (run.assistantText) {
        setMessages((prev) => [...prev, { role: "assistant", text: run.assistantText! }]);
      } else if (run.status === "RUNNING" || run.status === "WAITING_ON_STEP") {
        await stepUntilDone(run.runId);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl tracking-tight">Marketing Agent</h1>
        <p className="text-text-muted text-sm mt-1">
          Paste a climb replay — the agent analyzes intense moments, writes the marketing brief, and generates video.
          {runId && <span className="ml-2 font-mono text-xs">run: {runId.slice(0, 8)}…</span>}
          {status && <span className="ml-2 font-mono text-xs">({status})</span>}
        </p>
      </header>

      <div className="rounded-xl border border-border bg-elevated flex flex-col h-[32rem]">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-text-muted text-sm">
              Paste a /play?r=… replay link below. The agent will analyze highlights, craft copy, and generate a Sora video.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`rounded-lg px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap ${
                m.role === "user" ? "ml-auto bg-signal/10 text-text-primary" : "bg-void text-text-muted"
              }`}
            >
              {m.text}
            </div>
          ))}
          {toolCalls.map((t) => (
            <div key={t.id} className="rounded-lg border border-border/50 bg-void px-3 py-2 text-xs font-mono text-text-muted">
              <span className="text-signal">{t.toolName ?? "llm"}</span> → {t.status}
            </div>
          ))}
        </div>

        <form onSubmit={handleSend} className="border-t border-border p-3 space-y-2">
          <input
            value={replayUrl}
            onChange={(e) => setReplayUrl(e.target.value)}
            placeholder="Replay link — https://www.doomstack.lol/play?r=…"
            className="w-full rounded-lg border border-border bg-void px-3 py-2 text-sm focus:outline-none focus:border-border-focus"
            disabled={loading}
          />
          <div className="flex gap-2">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Optional: angle or platform (e.g. hype TikTok)"
              className="flex-1 rounded-lg border border-border bg-void px-3 py-2 text-sm focus:outline-none focus:border-border-focus"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || (!message.trim() && !replayUrl.trim())}
              className="rounded-full bg-signal px-4 py-2 text-sm font-semibold text-void disabled:opacity-50"
            >
              {loading ? "…" : "Send"}
            </button>
          </div>
        </form>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  );
}
