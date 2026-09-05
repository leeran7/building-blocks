"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSocialApi, SocialApiError } from "../../../../src/components/Social/useSocialApi";

interface ContentItem {
  id: string;
  platform: string;
  title: string | null;
  hook: string | null;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  failureReason: string | null;
}

interface Account {
  id: string;
  platform: string;
  handle: string;
  status: string;
}

const PUBLISHED_PAGE_SIZE = 5;

const FOCUS_RING =
  "focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void";

/** Maps SocialApiError.code -> user-facing copy per loop/design.md §5.4. */
function errorCopy(err: SocialApiError, platform: string): { text: string; reconnect: boolean } {
  switch (err.code) {
    case "REAUTH_REQUIRED":
      return { text: "This account's connection expired.", reconnect: true };
    case "RATE_LIMITED":
      return { text: "Publishing too fast — try again in a minute.", reconnect: false };
    case "NOT_APPROVED":
      return { text: "This draft hasn't been approved yet.", reconnect: false };
    case "UNSUPPORTED_BY_PLATFORM":
      return { text: `${platform} doesn't support this — ${err.message}`, reconnect: false };
    default:
      return { text: err.message, reconnect: false };
  }
}

export default function CalendarPage() {
  const { request } = useSocialApi();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [scheduleWhen, setScheduleWhen] = useState("");
  const [scheduleAccountId, setScheduleAccountId] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, { text: string; reconnect: boolean }>>({});
  const [showAllPublished, setShowAllPublished] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      request<{ items: ContentItem[] }>("/api/social/content"),
      request<{ accounts: Account[] }>("/api/social/accounts"),
    ])
      .then(([content, acc]) => {
        setItems(content.items);
        setAccounts(acc.accounts);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [request]);

  useEffect(() => {
    load();
  }, [load]);

  function clearRowError(id: string) {
    setRowErrors((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  const approved = items.filter((i) => i.status === "APPROVED");
  const failed = items.filter((i) => i.status === "FAILED");
  const scheduled = items
    .filter((i) => i.status === "SCHEDULED")
    .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));
  const published = items
    .filter((i) => i.status === "PUBLISHED")
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  const publishedVisible = showAllPublished ? published : published.slice(0, PUBLISHED_PAGE_SIZE);

  function openSchedule(item: ContentItem) {
    setExpandedId(item.id);
    setScheduleWhen("");
    const firstAccount = accounts.find((a) => a.platform === item.platform && a.status === "CONNECTED");
    setScheduleAccountId(firstAccount?.id ?? "");
    clearRowError(item.id);
  }

  function closeSchedule() {
    setExpandedId(null);
  }

  async function confirmSchedule(item: ContentItem) {
    if (!scheduleWhen || !scheduleAccountId) return;
    setActingId(item.id);
    clearRowError(item.id);
    try {
      const iso = new Date(scheduleWhen).toISOString();
      await request(`/api/social/content/${item.id}/schedule`, {
        method: "POST",
        body: JSON.stringify({ scheduledAt: iso, socialAccountId: scheduleAccountId }),
      });
      setExpandedId(null);
      load();
    } catch (err) {
      setRowErrors((prev) => ({ ...prev, [item.id]: errorCopy(err as SocialApiError, item.platform) }));
    } finally {
      setActingId(null);
    }
  }

  async function publishNow(item: ContentItem) {
    setActingId(item.id);
    clearRowError(item.id);
    try {
      await request(`/api/social/content/${item.id}/publish`, { method: "POST", body: "{}" });
      load();
    } catch (err) {
      setRowErrors((prev) => ({ ...prev, [item.id]: errorCopy(err as SocialApiError, item.platform) }));
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl tracking-tight">Calendar</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Approved drafts ready to schedule, what&apos;s queued, what&apos;s live.
        </p>
      </header>

      {error && <p className="text-sm text-danger">{error}</p>}

      <section id="approved" className="space-y-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-secondary">
          Approved — needs scheduling ({approved.length})
        </h2>
        {loading ? (
          <SkeletonRows count={2} />
        ) : approved.length === 0 ? (
          <EmptySection>
            Nothing approved yet — check{" "}
            <Link href="/admin/social/approvals" className={`text-signal underline ${FOCUS_RING} rounded`}>
              Approvals
            </Link>
            .
          </EmptySection>
        ) : (
          <ul className="space-y-2">
            {approved.map((item) => {
              const eligibleAccounts = accounts.filter((a) => a.platform === item.platform && a.status === "CONNECTED");
              const rowError = rowErrors[item.id];
              const isExpanded = expandedId === item.id;
              return (
                <li key={item.id} className="rounded-xl border border-border bg-elevated p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="font-mono text-xs text-text-secondary">{item.platform}</span>
                      <p className="text-sm text-text-primary">{item.title ?? item.hook ?? "Untitled draft"}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => (isExpanded ? closeSchedule() : openSchedule(item))}
                      aria-expanded={isExpanded}
                      className={`inline-flex min-h-[44px] items-center gap-1 rounded-full border border-border-strong px-4 text-xs font-medium text-text-primary hover:border-signal/50 ${FOCUS_RING}`}
                    >
                      Schedule{" "}
                      <span className={`inline-block transition-transform ${isExpanded ? "rotate-180" : ""}`} aria-hidden="true">
                        ▾
                      </span>
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 space-y-3 rounded-lg border border-border-subtle bg-void p-3">
                      {eligibleAccounts.length === 0 ? (
                        <p className="text-xs text-warning">
                          No connected {item.platform} account.{" "}
                          <Link href="/admin/social/settings" className={`underline ${FOCUS_RING} rounded`}>
                            Connect one in Settings →
                          </Link>
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-3">
                          <label className="flex flex-col gap-1 text-xs text-text-secondary">
                            When
                            <input
                              type="datetime-local"
                              value={scheduleWhen}
                              onChange={(e) => setScheduleWhen(e.target.value)}
                              className={`rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none ${FOCUS_RING}`}
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-text-secondary">
                            Account
                            <select
                              value={scheduleAccountId}
                              onChange={(e) => setScheduleAccountId(e.target.value)}
                              className={`rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none ${FOCUS_RING}`}
                            >
                              {eligibleAccounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  @{a.handle}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      )}

                      {rowError && (
                        <p className="text-xs text-danger" role="alert">
                          {rowError.text}
                          {rowError.reconnect && (
                            <>
                              {" "}
                              <Link href="/admin/social/settings" className={`underline ${FOCUS_RING} rounded`}>
                                Reconnect →
                              </Link>
                            </>
                          )}
                        </p>
                      )}

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={closeSchedule}
                          className={`min-h-[36px] rounded-full border border-border-strong px-4 py-1.5 text-xs text-text-secondary hover:text-text-primary ${FOCUS_RING}`}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={actingId === item.id || !scheduleWhen || !scheduleAccountId || eligibleAccounts.length === 0}
                          onClick={() => confirmSchedule(item)}
                          aria-busy={actingId === item.id}
                          className={`min-h-[36px] rounded-full bg-signal px-4 py-1.5 text-xs font-semibold text-void disabled:opacity-50 ${FOCUS_RING}`}
                        >
                          {actingId === item.id ? "Confirming…" : "Confirm"}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {!loading && failed.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-secondary">
            Failed — needs attention ({failed.length})
          </h2>
          <ul className="space-y-2">
            {failed.map((item) => (
              <li key={item.id} className="rounded-xl border border-border bg-elevated p-4">
                <span className="font-mono text-xs text-text-secondary">{item.platform}</span>
                <p className="text-sm text-text-primary">{item.title ?? item.hook ?? "Untitled draft"}</p>
                {item.failureReason && <p className="mt-1 text-xs text-danger">{item.failureReason}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-secondary">
          Scheduled ({scheduled.length})
        </h2>
        {loading ? (
          <SkeletonRows count={2} />
        ) : scheduled.length === 0 ? (
          <EmptySection>Nothing scheduled.</EmptySection>
        ) : (
          <ul className="space-y-2">
            {scheduled.map((item) => {
              const rowError = rowErrors[item.id];
              return (
                <li key={item.id} className="rounded-xl border border-border bg-elevated p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="font-mono text-xs text-text-secondary">{item.platform}</span>
                      <p className="text-sm text-text-primary">{item.title ?? item.hook ?? "Untitled draft"}</p>
                      <p className="mt-1 text-xs text-text-secondary">
                        {item.scheduledAt ? new Date(item.scheduledAt).toLocaleString() : "—"}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={actingId === item.id}
                      aria-busy={actingId === item.id}
                      onClick={() => publishNow(item)}
                      className={`inline-flex min-h-[44px] items-center rounded-full border border-border-strong px-4 text-xs font-medium text-text-primary hover:border-signal/50 disabled:opacity-50 ${FOCUS_RING}`}
                    >
                      {actingId === item.id ? "Publishing…" : "Publish now"}
                    </button>
                  </div>
                  {rowError && (
                    <p className="mt-2 text-xs text-danger" role="alert">
                      {rowError.text}
                      {rowError.reconnect && (
                        <>
                          {" "}
                          <Link href="/admin/social/settings" className={`underline ${FOCUS_RING} rounded`}>
                            Reconnect →
                          </Link>
                        </>
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-secondary">
            Published — recent ({published.length}
            {!showAllPublished && published.length > PUBLISHED_PAGE_SIZE ? `, showing ${PUBLISHED_PAGE_SIZE}` : ""})
          </h2>
          {published.length > PUBLISHED_PAGE_SIZE && (
            <button
              type="button"
              onClick={() => setShowAllPublished((v) => !v)}
              className={`text-xs text-signal hover:underline ${FOCUS_RING} rounded`}
            >
              {showAllPublished ? "Show less" : "See all →"}
            </button>
          )}
        </div>
        {loading ? (
          <SkeletonRows count={2} />
        ) : published.length === 0 ? (
          <EmptySection>Nothing published yet.</EmptySection>
        ) : (
          <ul className="space-y-2">
            {publishedVisible.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-elevated p-4"
              >
                <div>
                  <span className="font-mono text-xs text-text-secondary">{item.platform}</span>
                  <p className="text-sm text-text-primary">{item.title ?? item.hook ?? "Untitled draft"}</p>
                </div>
                <span className="text-xs text-text-secondary">
                  {item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-16 rounded-xl border border-border bg-elevated/60 animate-pulse motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

function EmptySection({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-text-secondary">{children}</p>;
}
