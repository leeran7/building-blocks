"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { Navbar } from "../Navbar";

interface PrizeEntry {
  tournamentId: string;
  tournamentName: string;
  placement: number | null;
  prizeCents: number;
  payoutStatus: string | null;
}

interface PayoutData {
  prizes: PrizeEntry[];
  connected: boolean;
  payoutReady: boolean;
}

function statusLabel(payoutStatus: string | null, payoutReady: boolean): string {
  if (payoutStatus === "transfer_paid") return "Paid";
  if (payoutStatus === "transfer_created") return "Transfer in progress";
  if (payoutStatus === "transfer_failed") return "Transfer failed — contact support";
  if (payoutReady) return "Ready — disbursing soon";
  return "Awaiting payout setup";
}

export function PayoutPage() {
  const { user, token } = useAuth();
  const searchParams = useSearchParams();
  const [data, setData] = useState<PayoutData | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const justOnboarded = searchParams.get("onboarded") === "true";

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/account/payout", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setData(await res.json());
    } catch {
      // best-effort; leave prior data on screen
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const handleConnect = useCallback(async () => {
    if (!token) return;
    setConnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/connect/onboard", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError("Could not start payout setup. Try again.");
        setConnecting(false);
        return;
      }
      const body = (await res.json()) as { url: string };
      window.location.href = body.url;
    } catch {
      setError("Network error. Please try again.");
      setConnecting(false);
    }
  }, [token]);

  if (!user) {
    return (
      <main className="grain topo relative min-h-screen bg-void flex flex-col">
        <div className="shrink-0"><Navbar contextLabel="Payouts" /></div>
        <p className="mt-16 text-center text-text-secondary">Sign in to view your payouts.</p>
      </main>
    );
  }

  return (
    <main className="grain topo relative min-h-screen bg-void flex flex-col">
      <div className="shrink-0"><Navbar contextLabel="Payouts" /></div>

      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="font-display text-2xl font-bold text-text-primary">Tournament payouts</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Prize money is disbursed via Stripe to a connected payout account.
        </p>

        {justOnboarded && (
          <p className="mt-4 rounded-lg border border-signal/40 bg-signal/10 px-3 py-2 text-sm text-signal">
            Payout setup complete. We&apos;ll disburse any pending prizes shortly.
          </p>
        )}

        {loading ? (
          <p className="mt-8 text-text-secondary text-sm">Loading...</p>
        ) : (
          <>
            {!data?.payoutReady && (
              <div className="mt-6 rounded-xl border border-border-strong bg-surface p-5">
                <p className="text-sm font-semibold text-text-primary">
                  {data?.connected ? "Finish payout setup" : "Set up payouts"}
                </p>
                <p className="text-sm text-text-secondary mt-1">
                  Prize winners connect a Stripe account once to receive future disbursements.
                </p>
                {error && <p className="text-ember text-sm mt-2" role="alert">{error}</p>}
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="mt-3 inline-flex items-center justify-center rounded-full px-6 min-h-[44px] bg-signal text-void font-semibold text-sm hover:brightness-110 active:scale-[0.98] transition-[filter,transform] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {connecting ? "Redirecting..." : data?.connected ? "Continue setup" : "Set up payouts"}
                </button>
              </div>
            )}

            <div className="mt-6">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-text-secondary">
                Prizes
              </h2>
              {!data?.prizes.length ? (
                <p className="mt-2 text-sm text-text-secondary">No prizes yet.</p>
              ) : (
                <div className="mt-2 grid gap-2">
                  {data.prizes.map((p) => (
                    <div
                      key={p.tournamentId}
                      className="flex items-center justify-between rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-sm"
                    >
                      <div>
                        <p className="text-text-primary font-medium">{p.tournamentName}</p>
                        <p className="text-xs text-text-muted mt-0.5">
                          {p.placement === 1 ? "1st place" : p.placement === 2 ? "2nd place" : `${p.placement}th place`}
                          {" · "}
                          {statusLabel(p.payoutStatus, data.payoutReady)}
                        </p>
                      </div>
                      <span className="font-semibold text-signal tabular-nums">
                        ${(p.prizeCents / 100).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
