"use client";

/**
 * Redesigned AI Assistant transcript tool chip (loop/design.md §6.4/§7.4).
 * Replaces the old raw `{toolName} → {status}` chip with a plain-English
 * category + verb + state-specific styling, and surfaces the human-authored
 * `errorMessage` inline (never just a bare enum) with a "Reconnect →" link
 * when the failure is account/auth-shaped.
 */

import Link from "next/link";
import { CATEGORY_ICONS, CATEGORY_LABELS, TOOL_CATEGORIES, isKnownToolCategoryName } from "./toolCategories";

export interface AgentToolChipTask {
  id: string;
  toolName: string | null;
  status: string;
  outputSanitized?: unknown;
  errorMessage?: string | null;
}

const REAUTH_REASONS = new Set(["REAUTH_REQUIRED"]);
const REAUTH_HINT_PATTERN = /reauth|reconnect|expired|re-authenticate|re-authorize/i;

function readStringField(value: unknown, field: string): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = (value as Record<string, unknown>)[field];
  return typeof raw === "string" ? raw : undefined;
}

function focusRing() {
  return "focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void rounded";
}

export function AgentToolChip({ task }: { task: AgentToolChipTask }) {
  const info = isKnownToolCategoryName(task.toolName) ? TOOL_CATEGORIES[task.toolName] : null;
  const categoryLabel = info ? CATEGORY_LABELS[info.category] : "Assistant";
  const icon = info ? CATEGORY_ICONS[info.category] : "•";

  const isPending = task.status === "PENDING" || task.status === "RUNNING";
  const isSucceeded = task.status === "SUCCEEDED";
  const isFailed = task.status === "FAILED";
  const isUnsupported = task.status === "UNSUPPORTED";

  const copy = info ? (isSucceeded ? info.verbDone : info.verb) : task.status;

  const detail = task.errorMessage ?? readStringField(task.outputSanitized, "detail");
  const reason = readStringField(task.outputSanitized, "reason");
  const needsReconnect =
    (isFailed || isUnsupported) &&
    ((reason ? REAUTH_REASONS.has(reason) : false) || (detail ? REAUTH_HINT_PATTERN.test(detail) : false));

  const toneBorder = isFailed
    ? "border-border border-l-2 border-l-danger"
    : isUnsupported
      ? "border-border border-l-2 border-l-warning"
      : "border-border";

  return (
    <div
      className={`rounded-lg border bg-void px-3 py-2 text-xs ${toneBorder} ${isPending ? "animate-pulse motion-reduce:animate-none" : ""
        }`}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="text-text-secondary">
          {icon}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wide text-text-secondary">{categoryLabel}</span>
        <span className="flex-1 truncate text-text-primary">{copy}</span>
        <StatusGlyph status={task.status} />
      </div>

      {(isFailed || isUnsupported) && detail && (
        <p className={`mt-1 ${isFailed ? "text-danger" : "text-warning"}`}>
          {detail}
          {needsReconnect && (
            <>
              {" "}
              <Link href="/admin/social/settings" className={`underline ${focusRing()}`}>
                Reconnect →
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}

function StatusGlyph({ status }: { status: string }) {
  if (status === "SUCCEEDED") {
    return (
      <span className="text-success" aria-hidden="true">
        ✓
      </span>
    );
  }
  if (status === "FAILED") {
    return (
      <span className="text-danger" aria-hidden="true">
        ✕
      </span>
    );
  }
  if (status === "UNSUPPORTED") {
    return (
      <span className="text-warning" aria-hidden="true">
        ⚠
      </span>
    );
  }
  return (
    <span className="text-text-secondary" aria-hidden="true">
      …
    </span>
  );
}
