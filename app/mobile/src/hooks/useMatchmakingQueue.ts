import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { tapMedium, tapLight, notifySuccess, notifyError } from "../lib/haptics";

// ─── Types ───────────────────────────────────────────────────────────────────

type QueueStatus = "idle" | "joining" | "searching" | "matched" | "timeout" | "error";

export interface QueueState {
  status: QueueStatus;
  duelId: string | null;
  errorMessage: string | null;
}

export interface UseMatchmakingQueue {
  state: QueueState;
  join: () => void;
  cancel: () => void;
  reset: () => void;
}

// ─── Poll response shape ─────────────────────────────────────────────────────

interface QueuePollResponse {
  status: string;
  duelId?: string;
}

interface QueueJoinResponse {
  status: string;
  duelId?: string;
  error?: string;
  code?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2000;
const CATEGORY_SLUG = "tech";

// ─── Hook ────────────────────────────────────────────────────────────────────

const IDLE_STATE: QueueState = { status: "idle", duelId: null, errorMessage: null };

export function useMatchmakingQueue(): UseMatchmakingQueue {
  const [state, setState] = useState<QueueState>(IDLE_STATE);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track whether the hook is still mounted to avoid setState after unmount.
  const mountedRef = useRef(true);
  // Track whether we are actively in the queue for cleanup on unmount.
  const inQueueRef = useRef(false);

  // ─── Helpers ─────────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch("/api/duel/queue");
        if (!mountedRef.current) return;
        if (!res.ok) return; // Ignore poll errors; next tick recovers.

        const body = (await res.json()) as QueuePollResponse;

        if (body.status === "matched" && body.duelId) {
          stopPolling();
          inQueueRef.current = false;
          void notifySuccess();
          setState({ status: "matched", duelId: body.duelId, errorMessage: null });
          return;
        }

        if (body.status === "expired" || body.status === "idle") {
          // Queue slot expired or was never created -- surface timeout.
          stopPolling();
          inQueueRef.current = false;
          setState({ status: "timeout", duelId: null, errorMessage: null });
          return;
        }

        // "waiting" -- keep polling.
      } catch {
        // Swallow poll errors; the next interval tick will retry.
      }
    }, POLL_INTERVAL_MS);
  }, [stopPolling]);

  // ─── Join ────────────────────────────────────────────────────────────

  const join = useCallback(async () => {
    void tapMedium();
    setState({ status: "joining", duelId: null, errorMessage: null });

    try {
      const res = await apiFetch("/api/duel/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categorySlug: CATEGORY_SLUG }),
      });

      if (!mountedRef.current) return;

      // 409 = already in queue from a prior search. Resume polling.
      if (res.status === 409) {
        inQueueRef.current = true;
        setState({ status: "searching", duelId: null, errorMessage: null });
        startPolling();
        return;
      }

      if (res.status === 429) {
        void notifyError();
        setState({
          status: "error",
          duelId: null,
          errorMessage: "Too many searches -- give it a minute",
        });
        return;
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        void notifyError();
        setState({
          status: "error",
          duelId: null,
          errorMessage:
            typeof body.error === "string" ? body.error : "Could not join queue",
        });
        return;
      }

      const body = (await res.json()) as QueueJoinResponse;

      // Instant match.
      if (body.status === "matched" && body.duelId) {
        inQueueRef.current = false;
        void notifySuccess();
        setState({ status: "matched", duelId: body.duelId, errorMessage: null });
        return;
      }

      // Expired right on the POST (unlikely, but handle it).
      if (body.status === "expired") {
        inQueueRef.current = false;
        setState({ status: "timeout", duelId: null, errorMessage: null });
        return;
      }

      // Waiting -- start polling.
      inQueueRef.current = true;
      setState({ status: "searching", duelId: null, errorMessage: null });
      startPolling();
    } catch {
      if (!mountedRef.current) return;
      void notifyError();
      setState({
        status: "error",
        duelId: null,
        errorMessage: "Network error -- check your connection",
      });
    }
  }, [startPolling]);

  // ─── Cancel ──────────────────────────────────────────────────────────

  const cancel = useCallback(() => {
    void tapLight();
    stopPolling();
    setState(IDLE_STATE);

    if (inQueueRef.current) {
      inQueueRef.current = false;
      // Best-effort DELETE; we do not await or surface errors.
      apiFetch("/api/duel/queue", { method: "DELETE" }).catch(() => {});
    }
  }, [stopPolling]);

  // ─── Reset (from timeout/error back to idle) ────────────────────────

  const reset = useCallback(() => {
    stopPolling();
    inQueueRef.current = false;
    setState(IDLE_STATE);
  }, [stopPolling]);

  // ─── Cleanup on unmount ──────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      // Best-effort leave queue if still searching when component unmounts.
      if (inQueueRef.current) {
        inQueueRef.current = false;
        apiFetch("/api/duel/queue", { method: "DELETE" }).catch(() => {});
      }
    };
  }, []);

  return { state, join, cancel, reset };
}
