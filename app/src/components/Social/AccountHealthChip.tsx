"use client";

/**
 * One chip per platform, always all 3 SOCIAL_PLATFORMS even when there is no
 * SocialAccount row for it (loop/design.md §4.2/§7.6) — the Dashboard's
 * accounts strip needs to answer "what's broken/missing" before anything
 * else loads. Also reusable on Settings.
 */

import Link from "next/link";

const REAUTH_STATUSES = new Set(["TOKEN_EXPIRED", "REAUTH_REQUIRED", "ERROR"]);

const FOCUS_RING =
  "focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void";

export interface AccountHealthChipProps {
  platform: string;
  handle: string | null;
  /** null = no SocialAccount row for this platform at all (never connected / fully disconnected). */
  status: string | null;
  loading?: boolean;
}

export function AccountHealthChip({ platform, handle, status, loading }: AccountHealthChipProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-elevated p-4">
        <div className="h-3 w-16 rounded bg-elevated/60 animate-pulse motion-reduce:animate-none" />
        <div className="h-4 w-24 rounded bg-elevated/60 animate-pulse motion-reduce:animate-none" />
      </div>
    );
  }

  if (!status) {
    return (
      <Link
        href="/admin/social/settings"
        className={`flex min-h-[44px] flex-col gap-1 rounded-xl border border-border bg-elevated p-4 hover:border-signal/50 ${FOCUS_RING}`}
      >
        <PlatformLabel platform={platform} dotClassName="border border-border-strong" />
        <span className="text-sm text-text-secondary">Not connected</span>
        <span className="text-xs text-signal">Connect →</span>
      </Link>
    );
  }

  const needsReauth = REAUTH_STATUSES.has(status);

  const body = (
    <>
      <PlatformLabel platform={platform} dotClassName={needsReauth ? "bg-warning" : "bg-success"} />
      {handle && <span className="text-sm text-text-primary">@{handle}</span>}
      <span className={`text-xs ${needsReauth ? "text-warning" : "text-text-secondary"}`}>
        {needsReauth ? "Reauth needed" : "Connected"}
      </span>
    </>
  );

  if (needsReauth) {
    return (
      <Link
        href="/admin/social/settings"
        className={`flex min-h-[44px] flex-col gap-1 rounded-xl border border-border bg-elevated p-4 hover:border-signal/50 ${FOCUS_RING}`}
      >
        {body}
      </Link>
    );
  }

  return <div className="flex min-h-[44px] flex-col gap-1 rounded-xl border border-border bg-elevated p-4">{body}</div>;
}

function PlatformLabel({ platform, dotClassName }: { platform: string; dotClassName: string }) {
  return (
    <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-text-secondary">
      <span className={`h-2 w-2 rounded-full ${dotClassName}`} aria-hidden="true" />
      {platform}
    </span>
  );
}
