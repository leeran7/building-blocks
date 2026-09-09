"use client";

/**
 * WalletCard — credit balances, cash-out, and recent activity on the dashboard.
 *
 * Two buckets: play credits (purchased, non-cashable) and winnings (won,
 * cashable). Cash-out draws only from winnings and is enabled once it clears the
 * minimum. Self-fetches /api/wallet so it needs no change to /api/dashboard.
 */

import { useCallback, useEffect, useState } from "react";
import { BuyCreditsModal } from "../Wallet/BuyCreditsModal";

const CASHOUT_MIN_USD = 10;

interface LedgerRow {
  id: string;
  bucket: "PLAY" | "WINNINGS";
  amountCents: number;
  kind: string;
  createdAt: string;
}

interface WalletData {
  playCents: number;
  winningsCents: number;
  ledger: LedgerRow[];
}

function dollars(cents: number): string {
  const sign = cents < 0 ? "−" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

const KIND_LABEL: Record<string, string> = {
  PURCHASE: "Bought credits",
  STAKE: "Staked a duel",
  WIN: "Won a duel",
  REFUND: "Stake refunded",
  CASHOUT_REQUEST: "Cash-out requested",
  CASHOUT_REVERSAL: "Cash-out reversed",
  ADJUSTMENT: "Adjustment",
};

function kindColor(kind: string): string {
  if (kind === "WIN") return "text-signal";
  if (kind === "CASHOUT_REQUEST") return "text-warning";
  return "text-text-secondary";
}

export function WalletCard({ token }: { token: string | null }) {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const [cashoutOpen, setCashoutOpen] = useState(false);
  const [cashoutUsd, setCashoutUsd] = useState<number>(CASHOUT_MIN_USD);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/wallet", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setWallet((await res.json()) as WalletData);
    } catch {
      // Non-critical.
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const winnings = wallet?.winningsCents ?? 0;
  const play = wallet?.playCents ?? 0;
  const canCashout = winnings >= CASHOUT_MIN_USD * 100;

  async function submitCashout() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/wallet/cashout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amountCents: Math.round(cashoutUsd * 100) }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Cash-out failed.");
        setBusy(false);
        return;
      }
      setCashoutOpen(false);
      setBusy(false);
      setNotice("Cash-out requested — we'll process it shortly.");
      refresh();
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="bg-surface rounded-xl border border-border-subtle p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-text-muted">Wallet</p>
        <button
          onClick={() => setBuyOpen(true)}
          className="font-mono text-xs uppercase tracking-[0.12em] text-text-muted hover:text-text-primary transition-colors"
        >
          + Buy credits
        </button>
      </div>

      <div className="flex gap-8">
        <div>
          <span className="block font-mono text-3xl font-bold tabular-nums text-signal">
            {dollars(winnings)}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
            winnings · cashable
          </span>
        </div>
        <div>
          <span className="block font-mono text-3xl font-bold tabular-nums text-text-secondary">
            {dollars(play)}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
            credits · play only
          </span>
        </div>
      </div>

      <button
        onClick={() => {
          setCashoutUsd(Math.max(CASHOUT_MIN_USD, Math.floor(winnings / 100)));
          setCashoutOpen(true);
        }}
        disabled={!canCashout}
        className="mt-4 inline-flex items-center justify-center rounded-full px-5 min-h-[40px] border border-border-strong text-text-secondary text-sm hover:border-signal/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Cash out
      </button>
      {!canCashout && winnings > 0 && (
        <span className="ml-3 font-mono text-[11px] text-text-muted">
          min ${CASHOUT_MIN_USD} to cash out
        </span>
      )}
      {notice && <p className="mt-3 text-sm text-signal">{notice}</p>}

      {/* Recent activity */}
      {wallet && wallet.ledger.length > 0 && (
        <div className="mt-5 border-t border-border-subtle pt-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted mb-2">
            Recent
          </p>
          <ul className="flex flex-col gap-1.5">
            {wallet.ledger.slice(0, 5).map((row) => (
              <li key={row.id} className="flex items-center justify-between text-sm">
                <span className={kindColor(row.kind)}>{KIND_LABEL[row.kind] ?? row.kind}</span>
                <span className="font-mono tabular-nums text-text-secondary">
                  {row.amountCents >= 0 ? "+" : ""}
                  {dollars(row.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Cash-out modal */}
      {cashoutOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Cash out winnings"
          onClick={() => setCashoutOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border-strong bg-surface-raised p-6 shadow-lifted"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-2xl font-black tracking-tight text-text-primary mb-1">
              Cash out
            </h2>
            <p className="text-text-secondary text-sm mb-4">
              Withdraw from your winnings ({dollars(winnings)} available). Processed
              manually within a few days.
            </p>
            <label className="block mb-4">
              <span className="font-mono text-xs uppercase tracking-[0.12em] text-text-muted">
                Amount (USD)
              </span>
              <input
                type="number"
                min={CASHOUT_MIN_USD}
                max={winnings / 100}
                value={cashoutUsd}
                onChange={(e) => setCashoutUsd(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-text-primary tabular-nums focus:border-signal focus:outline-none"
              />
            </label>
            {error && <p className="text-ember text-sm mb-3" role="alert">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setCashoutOpen(false)}
                className="inline-flex items-center justify-center rounded-full px-5 min-h-[44px] border border-border-strong text-text-secondary text-sm hover:border-text-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitCashout}
                disabled={busy || cashoutUsd < CASHOUT_MIN_USD || cashoutUsd * 100 > winnings}
                className="flex-1 inline-flex items-center justify-center rounded-full px-6 min-h-[44px] bg-signal text-void font-semibold text-sm hover:brightness-110 active:scale-[0.98] transition-[filter,transform] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? "Requesting…" : `Cash out $${cashoutUsd}`}
              </button>
            </div>
          </div>
        </div>
      )}

      <BuyCreditsModal
        open={buyOpen}
        onClose={() => {
          setBuyOpen(false);
          refresh();
        }}
        token={token}
      />
    </div>
  );
}
