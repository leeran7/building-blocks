"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSocialApi } from "../../../../src/components/Social/useSocialApi";
import { ApprovalCard, type ApprovalContentItem } from "../../../../src/components/Social/ApprovalCard";
import { RejectDialog } from "../../../../src/components/Social/RejectDialog";

type ContentItem = ApprovalContentItem;

export default function ApprovalsPage() {
  const { request } = useSocialApi();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});

  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    request<{ items: ContentItem[] }>("/api/social/content?status=READY_FOR_REVIEW")
      .then((data) => setItems(data.items))
      .catch((err: Error) => setListError(err.message))
      .finally(() => setLoading(false));
  }, [request]);

  useEffect(() => {
    load();
  }, [load]);

  function clearItemError(id: string) {
    setItemErrors((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function approve(id: string) {
    setActing(id);
    clearItemError(id);
    try {
      await request(`/api/social/content/${id}/approve`, { method: "POST", body: "{}" });
      load();
    } catch (err) {
      setItemErrors((prev) => ({ ...prev, [id]: (err as Error).message }));
    } finally {
      setActing(null);
    }
  }

  function openReject(id: string, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setRejectTarget(id);
    setRejectError(null);
  }

  function closeReject() {
    setRejectTarget(null);
    triggerRef.current?.focus();
  }

  async function confirmReject(reason: string) {
    if (!rejectTarget) return;
    setRejectSubmitting(true);
    setRejectError(null);
    try {
      await request(`/api/social/content/${rejectTarget}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      closeReject();
      load();
    } catch (err) {
      setRejectError((err as Error).message);
    } finally {
      setRejectSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl tracking-tight">Approval Queue</h1>
        <p className="mt-1 text-sm text-text-secondary">Review AI-generated drafts before scheduling or publishing.</p>
      </header>

      {listError && <p className="text-sm text-danger">{listError}</p>}

      <div className="space-y-4">
        {loading ? (
          <>
            <div className="h-32 rounded-xl border border-border bg-elevated/60 animate-pulse motion-reduce:animate-none" />
            <div className="h-32 rounded-xl border border-border bg-elevated/60 animate-pulse motion-reduce:animate-none" />
          </>
        ) : items.length === 0 ? (
          <p className="text-sm text-text-secondary">Nothing awaiting approval.</p>
        ) : (
          items.map((item) => (
            <ApprovalCard
              key={item.id}
              item={item}
              acting={acting === item.id}
              error={itemErrors[item.id]}
              onApprove={() => approve(item.id)}
              onReject={(e) => openReject(item.id, e.currentTarget)}
            />
          ))
        )}
      </div>

      <RejectDialog
        open={rejectTarget !== null}
        submitting={rejectSubmitting}
        error={rejectError}
        onCancel={closeReject}
        onConfirm={confirmReject}
      />
    </div>
  );
}
