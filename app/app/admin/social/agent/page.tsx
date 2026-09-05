"use client";

import { useState } from "react";
import Link from "next/link";
import { useSocialApi } from "../../../../src/components/Social/useSocialApi";
import { CapabilityCompare } from "../../../../src/components/Social/CapabilityCompare";
import { AgentToolChip, type AgentToolChipTask } from "../../../../src/components/Social/AgentToolChip";
import {
  CATEGORY_ORDER,
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  TOOL_DESCRIPTIONS,
  TOOLS_BY_CATEGORY,
} from "../../../../src/components/Social/toolCategories";

type AgentTask = AgentToolChipTask;

const FOCUS_RING =
  "focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void";

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
    let runError: string | undefined;

    while (currentStatus === "RUNNING" || currentStatus === "WAITING_ON_STEP") {
      const step = await request<{
        runId: string;
        status: string;
        assistantText?: string;
        error?: string;
        toolCalls?: AgentTask[];
      }>(`/api/social/agent/runs/${id}/step`, { method: "POST", body: "{}" });

      currentStatus = step.status;
      assistantText = step.assistantText;
      runError = step.error;
      if (step.toolCalls?.length) {
        setToolCalls((prev) => [...prev, ...step.toolCalls!]);
      }
    }

    setStatus(currentStatus);
    if (currentStatus === "FAILED") {
      setError(runError || "The agent run failed.");
    } else if (assistantText) {
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
        error?: string;
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
      if (run.status === "FAILED") {
        setError(run.error || "The agent run failed.");
      } else if (run.assistantText) {
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
      <header className="space-y-3">
        <div>
          <h1 className="font-display text-2xl tracking-tight">AI Assistant</h1>
          <p className="text-text-secondary text-sm mt-1">
            Your teammate for replay-to-post: it researches, writes, schedules, and publishes for you. For
            one quick idea,{" "}
            <Link href="/admin/social/content" className="text-signal underline">
              Quick Create
            </Link>{" "}
            is faster →
            {runId && <span className="ml-2 font-mono text-xs">run: {runId.slice(0, 8)}…</span>}
            {status && <span className="ml-2 font-mono text-xs">({status})</span>}
          </p>
        </div>
        <CapabilityCompare />
        <ToolReferencePanel />
      </header>

      <div className="rounded-xl border border-border bg-elevated flex flex-col h-[32rem]">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-text-secondary text-sm">
              Paste a /play?r=… replay link below. The agent will analyze highlights, craft copy, and generate a Sora video.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`rounded-lg px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap ${
                m.role === "user" ? "ml-auto bg-signal/10 text-text-primary" : "bg-void text-text-secondary"
              }`}
            >
              {m.text}
            </div>
          ))}
          <div aria-live="polite" className="space-y-2">
            {toolCalls.map((t) => (
              <AgentToolChip key={t.id} task={t} />
            ))}
          </div>
        </div>

        <form onSubmit={handleSend} className="border-t border-border p-3 space-y-2">
          <input
            value={replayUrl}
            onChange={(e) => setReplayUrl(e.target.value)}
            placeholder="Replay link — https://www.doomstack.lol/play?r=…"
            className={`w-full rounded-lg border border-border bg-void px-3 py-2 text-sm focus:outline-none ${FOCUS_RING}`}
            disabled={loading}
          />
          <div className="flex gap-2">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Optional: angle or platform (e.g. hype TikTok)"
              className={`flex-1 rounded-lg border border-border bg-void px-3 py-2 text-sm focus:outline-none ${FOCUS_RING}`}
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || (!message.trim() && !replayUrl.trim())}
              className={`rounded-full bg-signal px-4 py-2 text-sm font-semibold text-void disabled:opacity-50 ${FOCUS_RING}`}
            >
              {loading ? "…" : "Send"}
            </button>
          </div>
        </form>
      </div>

      {error && <p className="text-danger text-sm">{error}</p>}
    </div>
  );
}

/** Collapsed-by-default capability reference (loop/design.md §6.3 point 2). */
function ToolReferencePanel() {
  return (
    <details className="group rounded-xl border border-border bg-elevated px-4 py-3 open:pb-4">
      <summary
        className={`flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 text-sm text-text-primary [&::-webkit-details-marker]:hidden ${FOCUS_RING}`}
      >
        <span>What can I ask for?</span>
        <span className="inline-block transition-transform group-open:rotate-180" aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className="mt-3 space-y-2">
        {CATEGORY_ORDER.map((cat) => (
          <details key={cat} className="group/inner rounded-lg border border-border-subtle bg-void px-3 py-2">
            <summary
              className={`flex min-h-[36px] cursor-pointer list-none items-center gap-2 text-xs font-mono uppercase tracking-wide text-text-secondary [&::-webkit-details-marker]:hidden ${FOCUS_RING}`}
            >
              <span aria-hidden="true">{CATEGORY_ICONS[cat]}</span>
              {CATEGORY_LABELS[cat]}
              <span className="ml-auto inline-block transition-transform group-open/inner:rotate-180" aria-hidden="true">
                ▾
              </span>
            </summary>
            <ul className="mt-2 space-y-1.5 text-sm text-text-secondary">
              {TOOLS_BY_CATEGORY[cat].map((name) => (
                <li key={name}>{TOOL_DESCRIPTIONS[name]}</li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </details>
  );
}
