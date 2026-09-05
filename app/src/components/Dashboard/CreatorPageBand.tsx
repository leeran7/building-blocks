"use client";

/**
 * CreatorPageBand — dashboard banner for the user's public creator page.
 *
 * Has a username → show the live /c/[username] link + copy-to-clipboard.
 * No username → an edge-signal claim CTA (priority action) to /settings.
 */

import Link from "next/link";
import { useState } from "react";

export function CreatorPageBand({ username }: { username: string | null }) {
  const [copied, setCopied] = useState(false);

  if (!username) {
    return (
      <div className="mb-8 rounded-2xl border border-border-strong bg-surface edge-signal p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-signal">
            ◈ Claim your creator page
          </p>
          <p className="text-sm text-text-secondary mt-1">
            Turn your listings into one shareable profile.
          </p>
        </div>
        <Link
          href="/settings"
          className="flex-shrink-0 bg-signal text-void font-semibold rounded-full px-5 min-h-[44px] inline-flex items-center justify-center hover:brightness-110 active:scale-[0.98] transition-[filter,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
        >
          Claim your page
        </Link>
      </div>
    );
  }

  const path = `/c/${username}`;

  async function copy() {
    try {
      const url =
        typeof window !== "undefined" ? window.location.origin + path : path;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the visible link is the fallback */
    }
  }

  return (
    <div className="mb-8 rounded-2xl border border-border-strong bg-surface p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-secondary">
          <span className="text-signal">◈</span> Your creator page is live
        </p>
        <p className="font-mono text-sm text-text-primary truncate mt-1">{path}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link
          href={path}
          className="rounded-full border border-border-strong bg-surface/60 px-4 min-h-[44px] inline-flex items-center text-sm text-text-secondary hover:text-signal hover:border-signal/50 transition-colors"
        >
          View page ↗
        </Link>
        <button
          type="button"
          onClick={copy}
          className="rounded-full border border-border-strong bg-surface/60 px-4 min-h-[44px] inline-flex items-center text-sm text-text-secondary hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
        <span role="status" aria-live="polite" className="sr-only">
          {copied ? "Link copied to clipboard" : ""}
        </span>
      </div>
    </div>
  );
}
