"use client";

/**
 * WalletCard — chip balance and recent activity on the dashboard.
 *
 * Single bucket: play_credits_cents (non-cashable chips). Purchased via Stripe,
 * won/lost in chip duels. No cash-out path.
 */

import { useCallback, useEffect, useState } from "react";
import { BuyCreditsModal } from "../Wallet/BuyCreditsModal";

interface LedgerRow {
  id: string;
  bucket: "PLAY" | "WINNINGS";
  amountCents: number;
  kind: string;
  createdAt: string;
}

interface WalletData {
  playCents: number;
  ledger: LedgerRow[];
}

const KIND_LABEL: Record<string, string> = {
  PURCHASE: "Bought chips",
  STAKE: "Staked a duel",
  WIN: "Won a duel",
  REFUND: "Stake refunded",
  ADJUSTMENT: "Adjustment",
};

function kindColor(kind: string): string {
  if (kind === "WIN") return "text-signal";
  return "text-text-secondary";
}

export function WalletCard({ token }: { token: string | null }) {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);

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

  const chips = wallet?.playCents ?? 0;

  return (
    <div className="bg-surface rounded-xl border border-border-subtle p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-text-muted">Chips</p>
        <button
          onClick={() => setBuyOpen(true)}
          className="font-mono text-xs uppercase tracking-[0.12em] text-text-muted hover:text-text-primary transition-colors"
        >
          + Buy chips
        </button>
      </div>

      <div>
        <span className="block font-mono text-3xl font-bold tabular-nums text-signal">
          {(chips / 100).toLocaleString()}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
          chips · non-cashable
        </span>
      </div>

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
                  {(Math.abs(row.amountCents) / 100).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
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
