"use client";

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

interface TournamentBracketProps {
  duels: BracketDuel[];
  totalRounds: number;
}

export function TournamentBracket({ duels, totalRounds }: TournamentBracketProps) {
  const rounds = Array.from({ length: totalRounds }, (_, i) => i + 1);

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-6 min-w-max py-4">
        {rounds.map((round) => {
          const roundDuels = duels
            .filter((d) => d.tournament_round === round)
            .sort((a, b) => (a.bracket_position ?? 0) - (b.bracket_position ?? 0));

          return (
            <div key={round} className="flex flex-col gap-4 min-w-[200px]">
              <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-text-secondary text-center">
                {round === totalRounds ? "Final" : `Round ${round}`}
              </h4>
              <div className="flex flex-col justify-around gap-4 flex-1">
                {roundDuels.map((duel) => (
                  <MatchCard key={duel.id} duel={duel} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatchCard({ duel }: { duel: BracketDuel }) {
  const p1Name = duel.player1.display_name ?? "Player 1";
  const p2Name = duel.player2?.display_name ?? (duel.is_bye ? "BYE" : "TBD");
  const isComplete = duel.status === "completed" || duel.status === "voided";
  const winnerId = duel.winner?.id;

  return (
    <div className="rounded-lg border border-border-strong bg-surface overflow-hidden">
      <PlayerRow
        name={p1Name}
        isWinner={winnerId === duel.player1.id}
        isComplete={isComplete}
      />
      <div className="border-t border-border-strong" />
      <PlayerRow
        name={p2Name}
        isWinner={winnerId != null && duel.player2 != null && winnerId === duel.player2.id}
        isComplete={isComplete}
        isBye={duel.is_bye && !duel.player2}
      />
    </div>
  );
}

function PlayerRow({
  name,
  isWinner,
  isComplete,
  isBye,
}: {
  name: string;
  isWinner: boolean;
  isComplete: boolean;
  isBye?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between px-3 py-2 text-sm ${
        isWinner
          ? "bg-signal/10 text-signal font-semibold"
          : isComplete && !isBye
            ? "text-text-secondary"
            : "text-text-primary"
      } ${isBye ? "italic text-text-secondary" : ""}`}
    >
      <span className="truncate">{name}</span>
      {isWinner && (
        <span className="shrink-0 ml-2 text-xs font-medium text-signal">W</span>
      )}
    </div>
  );
}
