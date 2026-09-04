"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSocialApi } from "../../../src/components/Social/useSocialApi";

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
  title: string | null;
  status: string;
  scheduledAt: string | null;
}

export default function SocialOverviewPage() {
  const { request } = useSocialApi();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [pending, setPending] = useState<ContentItem[]>([]);
  const [scheduled, setScheduled] = useState<ContentItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      request<{ accounts: Account[] }>("/api/social/accounts"),
      request<{ items: ContentItem[] }>("/api/social/content?status=READY_FOR_REVIEW"),
      request<{ items: ContentItem[] }>("/api/social/content?status=SCHEDULED"),
    ])
      .then(([acc, rev, sched]) => {
        setAccounts(acc.accounts);
        setPending(rev.items);
        setScheduled(sched.items);
      })
      .catch((err) => setError(err.message));
  }, [request]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl tracking-tight">Social Overview</h1>
        <p className="text-text-muted text-sm mt-1">Connected accounts, approval queue, and upcoming posts.</p>
      </header>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Connected accounts" value={accounts.filter((a) => a.status === "CONNECTED").length} />
        <StatCard label="Awaiting approval" value={pending.length} href="/admin/social/approvals" />
        <StatCard label="Scheduled" value={scheduled.length} href="/admin/social/calendar" />
      </section>

      <section className="rounded-xl border border-border bg-elevated p-5">
        <h2 className="font-semibold text-sm mb-4">Connected accounts</h2>
        {accounts.length === 0 ? (
          <p className="text-text-muted text-sm">
            No accounts connected yet.{" "}
            <Link href="/admin/social/settings" className="text-signal underline">
              Connect TikTok, X, or YouTube
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-2">
            {accounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between text-sm">
                <span>
                  <span className="font-mono text-xs text-text-muted mr-2">{a.platform}</span>
                  {a.handle}
                </span>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, href }: { label: string; value: number; href?: string }) {
  const inner = (
    <div className="rounded-xl border border-border bg-elevated p-5">
      <p className="text-text-muted text-xs uppercase tracking-wide">{label}</p>
      <p className="font-display text-3xl mt-1">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "CONNECTED" ? "text-green-400" : status === "REAUTH_REQUIRED" ? "text-amber-400" : "text-text-muted";
  return <span className={`font-mono text-xs ${color}`}>{status}</span>;
}
