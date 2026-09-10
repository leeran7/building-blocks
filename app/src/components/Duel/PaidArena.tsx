"use client";

/**
 * PaidArena — the paid-mode panel on the /duel hub.
 *
 * A public per-tier queue: pick a stake, then "Find match" grabs the oldest open
 * room at that tier (or opens your own and waits). A live lobby lists other open
 * rooms you can join directly. Waiting rooms are escrowed pending duels; cancel
 * refunds your stake. Insufficient balance opens the buy-credits modal instead
 * of dead-ending. Rendered only when signed in and the paid flag is on.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { BuyCreditsModal } from "../Wallet/BuyCreditsModal";
import { STAKE_TIERS_CENTS, duelPayoutCents } from "../../config/paidDuel";

interface WalletState {
  playCents: number;
  winningsCents: number;
}

interface OpenRoom {
  id: string;
  stakeCents: number;
  creatorName: string | null;
  ageSeconds: number;
}

type Status = "idle" | "finding" | "waiting";

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function ageLabel(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

export function PaidArena() {
  const { token } = useAuth();
  const router = useRouter();

  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [stakeCents, setStakeCents] = useState<number>(STAKE_TIERS_CENTS[0]);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [waitingRoom, setWaitingRoom] = useState<{ id: string; stakeCents: number } | null>(null);
  const [openRooms, setOpenRooms] = useState<OpenRoom[]>([]);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const [geoBlocked, setGeoBlocked] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const authHeaders = useCallback(
    (): HeadersInit => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  const refreshWallet = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/wallet", { headers: authHeaders() });
      if (res.ok) {
        const b = (await res.json()) as WalletState;
        setWallet({ playCents: b.playCents, winningsCents: b.winningsCents });
      }
    } catch {
      // Non-critical.
    }
  }, [token, authHeaders]);

  useEffect(() => {
    refreshWallet();
  }, [refreshWallet]);

  const balanceCents = (wallet?.playCents ?? 0) + (wallet?.winningsCents ?? 0);
  const payoutCents = duelPayoutCents(stakeCents);

  // Poll our own match status while waiting so we route the instant someone joins.
  const beginWaitingPoll = useCallback(() => {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch("/api/duel/paid/match", { headers: authHeaders() });
        if (!r.ok) return;
        const d = (await r.json()) as { status: string; duelId?: string };
        if (d.status === "matched" && d.duelId) {
          stopPoll();
          router.push(`/duel/${d.duelId}`);
        } else if (d.status === "idle") {
          // Room vanished (swept/cancelled elsewhere) — reset.
          stopPoll();
          setStatus("idle");
          setWaitingRoom(null);
          refreshWallet();
        }
      } catch {
        // Next tick recovers.
      }
    }, 2000);
  }, [authHeaders, router, stopPoll, refreshWallet]);

  // Resume a waiting room (or route to a match) if the user returns mid-search.
  useEffect(() => {
    if (!token) return;
    let live = true;
    fetch("/api/duel/paid/match", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { status: string; duelId?: string; stakeCents?: number } | null) => {
        if (!live || !d) return;
        if (d.status === "matched" && d.duelId) {
          router.push(`/duel/${d.duelId}`);
        } else if (d.status === "waiting" && d.duelId) {
          setWaitingRoom({ id: d.duelId, stakeCents: d.stakeCents ?? stakeCents });
          setStatus("waiting");
          beginWaitingPoll();
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // Run once on mount / when auth arrives; helpers are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Refresh the joinable lobby while idle.
  const refreshOpen = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch(`/api/duel/paid/open?stake=${stakeCents}`, { headers: authHeaders() });
      if (!r.ok) return;
      const d = (await r.json()) as { rooms?: OpenRoom[] };
      setOpenRooms(Array.isArray(d.rooms) ? d.rooms : []);
    } catch {
      // Non-critical.
    }
  }, [token, stakeCents, authHeaders]);

  useEffect(() => {
    if (status !== "idle") return;
    refreshOpen();
    const t = setInterval(refreshOpen, 5000);
    return () => clearInterval(t);
  }, [status, refreshOpen]);

  useEffect(() => () => stopPoll(), [stopPoll]);

  const findMatch = useCallback(async () => {
    if (!token || !ageConfirmed) return;
    setError(null);
    setStatus("finding");
    try {
      const res = await fetch("/api/duel/paid/match", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ stakeUsd: stakeCents / 100, ageConfirmed: true }),
      });
      if (res.status === 402) {
        setBuyOpen(true);
        setStatus("idle");
        return;
      }
      if (res.status === 451) {
        setGeoBlocked(true);
        setStatus("idle");
        return;
      }
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? "Could not find a match.");
        setStatus("idle");
        return;
      }
      const d = (await res.json()) as { status: string; duelId?: string; stakeCents?: number };
      if (d.status === "matched" && d.duelId) {
        router.push(`/duel/${d.duelId}`);
        return;
      }
      if (d.status === "waiting" && d.duelId) {
        setWaitingRoom({ id: d.duelId, stakeCents: d.stakeCents ?? stakeCents });
        setStatus("waiting");
        beginWaitingPoll();
      }
    } catch {
      setError("Network error. Please try again.");
      setStatus("idle");
    }
  }, [token, ageConfirmed, stakeCents, router, beginWaitingPoll]);

  const cancelWaiting = useCallback(async () => {
    stopPoll();
    const id = waitingRoom?.id;
    setStatus("idle");
    setWaitingRoom(null);
    if (!token || !id) return;
    try {
      await fetch(`/api/duel/${id}`, { method: "DELETE", headers: authHeaders() });
    } catch {
      // Best-effort; the sweeper refunds abandoned rooms regardless.
    }
    refreshWallet();
  }, [token, waitingRoom, stopPoll, authHeaders, refreshWallet]);

  const joinRoom = useCallback(
    async (id: string) => {
      if (!token) return;
      if (!ageConfirmed) {
        setError("Confirm you are 18+ to join a paid match.");
        return;
      }
      setJoiningId(id);
      setError(null);
      try {
        const res = await fetch(`/api/duel/paid/${id}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ageConfirmed: true }),
        });
        if (res.status === 402) {
          setBuyOpen(true);
          setJoiningId(null);
          return;
        }
        if (res.status === 451) {
          setGeoBlocked(true);
          setJoiningId(null);
          return;
        }
        if (!res.ok) {
          const b = (await res.json().catch(() => ({}))) as { error?: string };
          setError(b.error ?? "Could not join that match.");
          setJoiningId(null);
          refreshOpen();
          return;
        }
        router.push(`/duel/${id}`);
      } catch {
        setError("Network error. Please try again.");
        setJoiningId(null);
      }
    },
    [token, ageConfirmed, router, refreshOpen]
  );

  if (geoBlocked) {
    return (
      <section className="bg-surface rounded-xl border border-border-subtle p-6 text-center">
        <p className="text-text-secondary text-sm">
          Paid duels aren&apos;t available in your region.
        </p>
      </section>
    );
  }

  return (
    <section className="bg-surface rounded-xl border border-signal/30 shadow-signal p-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal mb-0.5">
        [ real stakes ]
      </p>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold tracking-tight text-text-primary">
          Paid Arena
        </h2>
        {wallet && (
          <span className="font-mono text-xs tabular-nums text-text-muted">
            <span className="text-signal font-semibold">{dollars(wallet.winningsCents)}</span> won
            {" · "}
            {dollars(wallet.playCents)} credits
          </span>
        )}
      </div>
      <p className="text-text-secondary text-sm mt-1 mb-4">
        Stake credits head-to-head. Winner takes{" "}
        <span className="text-signal font-semibold">{dollars(payoutCents)}</span>{" "}
        <span className="text-text-muted">(10% fee)</span>.
      </p>

      {/* Stake tier picker */}
      <div className="grid grid-cols-4 gap-2 mb-4" role="group" aria-label="Stake tier">
        {STAKE_TIERS_CENTS.map((cents) => (
          <button
            key={cents}
            onClick={() => setStakeCents(cents)}
            disabled={status !== "idle"}
            aria-pressed={stakeCents === cents}
            className={`inline-flex items-center justify-center rounded-full min-h-[44px] text-sm font-semibold tabular-nums transition-colors disabled:opacity-50 ${
              stakeCents === cents
                ? "bg-signal text-void"
                : "border border-border-strong text-text-secondary hover:border-signal/50"
            }`}
          >
            {dollars(cents)}
          </button>
        ))}
      </div>

      <label className="flex items-start gap-2 mb-4 text-sm text-text-secondary">
        <input
          type="checkbox"
          checked={ageConfirmed}
          onChange={(e) => setAgeConfirmed(e.target.checked)}
          className="mt-0.5 accent-signal"
        />
        <span>
          I confirm I am 18+ and agree to the{" "}
          <a href="/terms" className="text-signal underline underline-offset-2" target="_blank">
            Terms
          </a>
          .
        </span>
      </label>

      {status === "waiting" && waitingRoom ? (
        <div className="rounded-lg border border-signal/40 bg-surface-raised p-4" aria-live="polite">
          <div className="flex items-center gap-2 text-text-secondary text-sm mb-3">
            <span
              className="w-4 h-4 rounded-full border-2 border-text-muted border-t-signal animate-spin"
              aria-hidden="true"
            />
            Waiting for a {dollars(waitingRoom.stakeCents)} opponent…
          </div>
          <p className="text-text-muted text-xs mb-3">
            Your {dollars(waitingRoom.stakeCents)} stake is held in escrow. Cancel to refund it.
          </p>
          <button
            onClick={cancelWaiting}
            className="inline-flex items-center justify-center rounded-full px-5 min-h-[44px] border border-border-strong text-text-secondary text-sm hover:border-ember/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
          >
            Cancel &amp; refund
          </button>
        </div>
      ) : (
        <button
          onClick={findMatch}
          disabled={status === "finding" || !ageConfirmed}
          className="inline-flex items-center justify-center rounded-full px-8 min-h-[48px] w-full bg-signal text-void font-semibold text-base tracking-tight hover:brightness-110 active:scale-[0.98] shadow-signal transition-[filter,transform] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
        >
          {status === "finding" ? "Finding a match…" : `Find ${dollars(stakeCents)} match`}
        </button>
      )}

      {/* Live lobby — other open rooms at this tier you can join directly. */}
      {status === "idle" && openRooms.length > 0 && (
        <div className="mt-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted mb-2">
            Open {dollars(stakeCents)} matches
          </p>
          <ul className="flex flex-col gap-2">
            {openRooms.map((room) => (
              <li
                key={room.id}
                className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-raised px-3 py-2.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-signal shrink-0" aria-hidden="true" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-text-primary truncate">
                    {room.creatorName ?? "Anonymous climber"}
                  </span>
                  <span className="block font-mono text-[11px] text-text-muted tabular-nums">
                    {dollars(room.stakeCents)} · waiting {ageLabel(room.ageSeconds)}
                  </span>
                </span>
                <button
                  onClick={() => joinRoom(room.id)}
                  disabled={joiningId === room.id}
                  className="shrink-0 inline-flex items-center justify-center rounded-full px-4 min-h-[40px] border border-signal/50 text-signal text-sm font-semibold hover:bg-signal/10 active:scale-[0.98] transition-[background-color,transform] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
                >
                  {joiningId === room.id ? "Joining…" : "Join"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={() => setBuyOpen(true)}
          className="font-mono text-xs uppercase tracking-[0.12em] text-text-muted hover:text-text-primary transition-colors"
        >
          + Buy credits
        </button>
        <span className="font-mono text-[11px] text-text-muted tabular-nums">
          balance {dollars(balanceCents)}
        </span>
      </div>

      {error && (
        <p className="mt-3 text-ember text-sm" role="alert">
          {error}
        </p>
      )}

      <BuyCreditsModal
        open={buyOpen}
        onClose={() => {
          setBuyOpen(false);
          refreshWallet();
        }}
        token={token}
      />
    </section>
  );
}
