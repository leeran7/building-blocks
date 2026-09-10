"use client";

import { useEffect, useState } from "react";
import { Navbar } from "../Navbar";
import { TournamentCard } from "./TournamentCard";

interface TournamentSummary {
  id: string;
  name: string;
  entryFeeCents: number;
  bracketSize: number;
  entrantCount: number;
  status: string;
  registrationClosesAt: string;
  categorySlug: string;
}

export function TournamentList() {
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tournaments")
      .then((r) => (r.ok ? r.json() : { tournaments: [] }))
      .then((data) => setTournaments(data.tournaments ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <main
      id="main-content"
      className="grain topo relative min-h-screen bg-void flex flex-col"
    >
      <div className="shrink-0">
        <Navbar contextLabel="Tournaments" />
      </div>

      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="font-display text-2xl font-bold text-text-primary">
          Tournaments
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Bracket-style 1v1 competitions with cash prizes
        </p>

        {loading && (
          <p className="mt-8 text-center text-text-secondary">Loading...</p>
        )}

        {!loading && tournaments.length === 0 && (
          <div className="mt-8 rounded-xl border border-border-strong bg-surface p-8 text-center">
            <p className="text-text-secondary">
              No tournaments available right now. Check back soon.
            </p>
          </div>
        )}

        {!loading && tournaments.length > 0 && (
          <div className="mt-6 grid gap-4">
            {tournaments.map((t) => (
              <TournamentCard key={t.id} {...t} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
