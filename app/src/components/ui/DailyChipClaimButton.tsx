"use client";

import type { ClaimDailyChipsState } from "../../hooks/useClaimDailyChips";

export function DailyChipClaimButton({
  state,
  onClaim,
  className,
  labels,
}: {
  state: ClaimDailyChipsState;
  onClaim: () => void;
  className?: string;
  labels?: {
    idle?: string;
    claiming?: string;
    claimed?: string;
    alreadyClaimed?: string;
  };
}) {
  const l = {
    idle: labels?.idle ?? "Claim free chips",
    claiming: labels?.claiming ?? "Claiming...",
    claimed: labels?.claimed ?? "Claimed",
    alreadyClaimed: labels?.alreadyClaimed ?? "Already claimed today",
  };

  const disabled =
    state.status === "claiming" ||
    state.status === "claimed" ||
    state.status === "already-claimed";

  const label =
    state.status === "claiming"
      ? l.claiming
      : state.status === "claimed"
        ? l.claimed
        : state.status === "already-claimed"
          ? l.alreadyClaimed
          : l.idle;

  return (
    <>
      <button
        type="button"
        onClick={onClaim}
        disabled={disabled}
        className={`disabled:opacity-50 disabled:cursor-not-allowed${className ? ` ${className}` : ""}`}
      >
        {label}
      </button>
      {state.status === "error" && (
        <p className="text-xs text-ember mt-1" role="alert">
          {state.message}
        </p>
      )}
    </>
  );
}
