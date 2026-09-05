"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSocialApi } from "../../../src/components/Social/useSocialApi";
import { AccountHealthChip } from "../../../src/components/Social/AccountHealthChip";
import { PipelineFunnel, type PipelineCounts } from "../../../src/components/Social/PipelineFunnel";
import { AttentionQueue, type AttentionItem } from "../../../src/components/Social/AttentionQueue";
import { SOCIAL_PLATFORMS } from "../../../src/social/types";

interface Account {
  id: string;
  platform: string;
  handle: string;
  displayName: string | null;
  status: string;
}

interface ContentItem {
  id: string;
  platform: string;
  status: string;
  scheduledAt: string | null;
}

const REAUTH_STATUSES = new Set(["TOKEN_EXPIRED", "REAUTH_REQUIRED", "ERROR"]);

export default function SocialDashboardPage() {
  const { request } = useSocialApi();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      request<{ accounts: Account[] }>("/api/social/accounts"),
      request<{ items: ContentItem[] }>("/api/social/content"),
    ])
      .then(([acc, content]) => {
        setAccounts(acc.accounts);
        setItems(content.items);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [request]);

  useEffect(() => {
    load();
  }, [load]);

  const counts: PipelineCounts = {
    drafting: items.filter((i) => i.status === "IDEA" || i.status === "DRAFT").length,
    inReview: items.filter((i) => i.status === "READY_FOR_REVIEW").length,
    approved: items.filter((i) => i.status === "APPROVED").length,
    scheduled: items.filter((i) => i.status === "SCHEDULED").length,
    published: items.filter((i) => i.status === "PUBLISHED").length,
  };
  const rejectedCount = items.filter((i) => i.status === "REJECTED").length;
  const failedCount = items.filter((i) => i.status === "FAILED").length;
  const now = Date.now();
  const overdueCount = items.filter(
    (i) => i.status === "SCHEDULED" && i.scheduledAt && new Date(i.scheduledAt).getTime() < now
  ).length;

  const attentionItems: AttentionItem[] = [];
  for (const a of accounts) {
    if (REAUTH_STATUSES.has(a.status)) {
      attentionItems.push({
        key: `account-${a.id}`,
        tone: "warning",
        icon: "⚠",
        label: `${a.platform} account needs reauthorization`,
        href: "/admin/social/settings",
      });
    }
  }
  if (counts.inReview > 0) {
    attentionItems.push({
      key: "in-review",
      tone: "warning",
      icon: "⏱",
      label: `${counts.inReview} draft${counts.inReview === 1 ? "" : "s"} awaiting review`,
      href: "/admin/social/approvals",
    });
  }
  if (failedCount > 0) {
    attentionItems.push({
      key: "failed",
      tone: "danger",
      icon: "✕",
      label: `${failedCount} post${failedCount === 1 ? "" : "s"} failed to publish`,
      href: "/admin/social/calendar",
    });
  }
  if (counts.approved > 0) {
    attentionItems.push({
      key: "approved",
      tone: "signal",
      icon: "→",
      label: `${counts.approved} approved draft${counts.approved === 1 ? "" : "s"} ready to schedule`,
      href: "/admin/social/calendar#approved",
    });
  }
  if (overdueCount > 0) {
    attentionItems.push({
      key: "overdue",
      tone: "warning",
      icon: "⚠",
      label: `${overdueCount} scheduled post${overdueCount === 1 ? "" : "s"} overdue — check publish sweep`,
      href: "/admin/social/calendar",
    });
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Where every stack of the pipeline stands, and what needs you next.
        </p>
      </header>

      {error && <p className="text-sm text-danger">{error}</p>}

      <section aria-labelledby="accounts-heading" className="space-y-3">
        <h2
          id="accounts-heading"
          className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-secondary"
        >
          Accounts
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {loading
            ? SOCIAL_PLATFORMS.map((p) => <AccountHealthChip key={p} platform={p} handle={null} status={null} loading />)
            : SOCIAL_PLATFORMS.map((p) => {
                const acc = accounts.find((a) => a.platform === p && a.status !== "DISCONNECTED");
                return <AccountHealthChip key={p} platform={p} handle={acc?.handle ?? null} status={acc?.status ?? null} />;
              })}
        </div>
      </section>

      <section aria-labelledby="pipeline-heading" className="space-y-3">
        <h2
          id="pipeline-heading"
          className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-secondary"
        >
          Pipeline
        </h2>
        <PipelineFunnel counts={loading ? null : counts} loading={loading} error={error} onRetry={load} />
        {!loading && !error && (rejectedCount > 0 || failedCount > 0) && (
          <p className="text-xs text-warning">
            ⚠ {rejectedCount} rejected · {failedCount} failed — see attention queue below
          </p>
        )}
      </section>

      <AttentionQueue items={attentionItems} loading={loading} error={error} onRetry={load} />

      <section className="flex flex-col gap-2 sm:flex-row">
        <Link
          href="/admin/social/content"
          className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-signal px-5 text-sm font-semibold text-void shadow-signal transition-[filter,transform] hover:brightness-110 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
        >
          + New idea (Quick Create)
        </Link>
        <Link
          href="/admin/social/agent"
          className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-border-strong bg-surface/60 px-5 text-sm font-medium text-text-primary transition-colors hover:border-signal/50 focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
        >
          ⟳ Paste a replay (AI Assistant)
        </Link>
      </section>
    </div>
  );
}
