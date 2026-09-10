"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { Navbar } from "../Navbar";
import { TournamentBracket } from "./TournamentBracket";
import { totalRounds } from "../../config/tournaments";

interface PrizeSlot {
  placement: number;
  amount_cents: number;
}

interface TournamentData {
  id: string;
  name: string;
  categorySlug: string;
  entryFeeCents: number;
  prizeStructure: PrizeSlot[];
  bracketSize: number;
  status: string;
  currentRound: number;
  registrationOpensAt: string;
  registrationClosesAt: string;
  startedAt: string | null;
  completedAt: string | null;
  entrantCount: number;
}

interface BracketDuel {
  id: string;
  tournament_round: number | null;
  bracket_position: number | null;
  status: string;
  is_bye: boolean;
  player1: { id: string; display_name: string | null };
  player2: { id: string; display_name: string | null } | null;
  winner: { id: string; display_name: string | null } | null;
}

export function TournamentDetail({ tournamentId }: { tournamentId: string }) {
  const { user, token } = useAuth();
  const router = useRouter();
  const [tournament, setTournament] = useState<TournamentData | null>(null);
  const [bracket, setBracket] = useState<BracketDuel[]>([]);
  const [loading, setLoading] = useState(true);
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    fetch(`/api/tournaments/${tournamentId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setTournament(data.tournament);
          setBracket(data.bracket ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tournamentId]);

  const handleEnter = useCallback(async () => {
    if (!token || !tournament) return;
    setEntering(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/checkout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to enter tournament");
        return;
      }
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch {
      alert("Something went wrong");
    } finally {
      setEntering(false);
    }
  }, [token, tournament, tournamentId]);

  if (loading) {
    return (
      <main className="grain topo relative min-h-screen bg-void flex flex-col">
        <div className="shrink-0"><Navbar contextLabel="Tournament" /></div>
        <p className="mt-16 text-center text-text-secondary">Loading...</p>
      </main>
    );
  }

  if (!tournament) {
    return (
      <main className="grain topo relative min-h-screen bg-void flex flex-col">
        <div className="shrink-0"><Navbar contextLabel="Tournament" /></div>
        <p className="mt-16 text-center text-text-secondary">Tournament not found.</p>
      </main>
    );
  }

  const fee = (tournament.entryFeeCents / 100).toFixed(2);
  const isOpen =
    tournament.status === "REGISTRATION" &&
    new Date(tournament.registrationClosesAt) > new Date();
  const spotsLeft = tournament.bracketSize - tournament.entrantCount;
  const rounds = totalRounds(tournament.bracketSize);

  const myDuel = bracket.find(
    (d) =>
      d.status === "active" &&
      user &&
      (d.player1.id === user.uid || d.player2?.id === user.uid)
  );

  return (
    <main className="grain topo relative min-h-screen bg-void flex flex-col">
      <div className="shrink-0"><Navbar contextLabel="Tournament" /></div>

      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="font-display text-2xl font-bold text-text-primary">
          {tournament.name}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {tournament.categorySlug} &middot; {tournament.bracketSize}-player bracket
        </p>

        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <div className="rounded-lg border border-border-strong bg-surface px-3 py-2">
            <span className="text-text-secondary">Entry</span>{" "}
            <span className="font-semibold text-text-primary">${fee}</span>
          </div>
          <div className="rounded-lg border border-border-strong bg-surface px-3 py-2">
            <span className="text-text-secondary">Players</span>{" "}
            <span className="font-semibold text-text-primary">
              {tournament.entrantCount}/{tournament.bracketSize}
            </span>
          </div>
          {tournament.status !== "REGISTRATION" && (
            <div className="rounded-lg border border-border-strong bg-surface px-3 py-2">
              <span className="text-text-secondary">Round</span>{" "}
              <span className="font-semibold text-text-primary">
                {tournament.currentRound}/{rounds}
              </span>
            </div>
          )}
        </div>

        {tournament.prizeStructure.length > 0 && (
          <div className="mt-6">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-text-secondary">
              Prizes
            </h2>
            <div className="mt-2 grid gap-2">
              {tournament.prizeStructure.map((p) => (
                <div
                  key={p.placement}
                  className="flex items-center justify-between rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm"
                >
                  <span className="text-text-primary">
                    {p.placement === 1 ? "1st" : p.placement === 2 ? "2nd" : p.placement === 3 ? "3rd" : `${p.placement}th`}
                  </span>
                  <span className="font-semibold text-signal">
                    ${(p.amount_cents / 100).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {isOpen && (
          <div className="mt-6">
            {!user ? (
              <a
                href={`/auth/signin?redirect=${encodeURIComponent(`/tournaments/${tournamentId}`)}`}
                className="inline-flex items-center justify-center rounded-lg bg-signal px-6 py-3 font-display text-sm font-semibold text-void transition-colors hover:bg-signal/90"
              >
                Sign in to enter
              </a>
            ) : (
              <button
                onClick={handleEnter}
                disabled={entering || spotsLeft <= 0}
                className="inline-flex items-center justify-center rounded-lg bg-signal px-6 py-3 font-display text-sm font-semibold text-void transition-colors hover:bg-signal/90 disabled:opacity-50"
              >
                {entering ? "Redirecting..." : `Enter tournament — $${fee}`}
              </button>
            )}
            <p className="mt-2 text-xs text-text-secondary">
              {spotsLeft} spot{spotsLeft !== 1 ? "s" : ""} remaining
            </p>
          </div>
        )}

        {myDuel && (
          <div className="mt-6 rounded-xl border-2 border-signal bg-signal/10 p-4">
            <p className="font-display font-semibold text-signal">
              Your match is live!
            </p>
            <button
              onClick={() => router.push(`/duel/${myDuel.id}`)}
              className="mt-2 inline-flex items-center justify-center rounded-lg bg-signal px-4 py-2 font-display text-sm font-semibold text-void"
            >
              Go to match
            </button>
          </div>
        )}

        {bracket.length > 0 && (
          <div className="mt-8">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-text-secondary mb-4">
              Bracket
            </h2>
            <TournamentBracket duels={bracket} totalRounds={rounds} />
          </div>
        )}
      </div>
    </main>
  );
}
