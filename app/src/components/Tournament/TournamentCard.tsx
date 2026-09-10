"use client";

import Link from "next/link";

interface TournamentCardProps {
  id: string;
  name: string;
  entryFeeCents: number;
  bracketSize: number;
  entrantCount: number;
  status: string;
  registrationClosesAt: string;
  categorySlug: string;
}

export function TournamentCard({
  id,
  name,
  entryFeeCents,
  bracketSize,
  entrantCount,
  status,
  registrationClosesAt,
  categorySlug,
}: TournamentCardProps) {
  const fee = (entryFeeCents / 100).toFixed(2);
  const spotsLeft = bracketSize - entrantCount;
  const closesAt = new Date(registrationClosesAt);
  const isOpen = status === "REGISTRATION" && closesAt > new Date();

  return (
    <Link
      href={`/tournaments/${id}`}
      className="group block rounded-xl border border-border-strong bg-surface p-4 transition-colors hover:border-signal"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold text-text-primary truncate">
            {name}
          </h3>
          <p className="mt-1 text-sm text-text-secondary">{categorySlug}</p>
        </div>
        <StatusBadge status={status} isOpen={isOpen} />
      </div>

      <div className="mt-3 flex items-center gap-4 text-sm text-text-secondary">
        <span>${fee} entry</span>
        <span>{bracketSize} players</span>
        {isOpen && <span className="text-signal">{spotsLeft} spots left</span>}
      </div>

      {isOpen && (
        <p className="mt-2 text-xs text-text-secondary">
          Closes {closesAt.toLocaleDateString()} at{" "}
          {closesAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
    </Link>
  );
}

function StatusBadge({ status, isOpen }: { status: string; isOpen: boolean }) {
  if (isOpen) {
    return (
      <span className="shrink-0 rounded-full bg-signal/15 px-2.5 py-0.5 text-xs font-medium text-signal">
        Open
      </span>
    );
  }
  if (status === "IN_PROGRESS") {
    return (
      <span className="shrink-0 rounded-full bg-ember/15 px-2.5 py-0.5 text-xs font-medium text-ember">
        Live
      </span>
    );
  }
  if (status === "COMPLETED") {
    return (
      <span className="shrink-0 rounded-full bg-text-secondary/15 px-2.5 py-0.5 text-xs font-medium text-text-secondary">
        Complete
      </span>
    );
  }
  return null;
}
