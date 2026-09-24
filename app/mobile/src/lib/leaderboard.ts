import { hashId } from "@app/lib/handle";
import { ALTITUDE_UNIT } from "@app/lib/units";
import type { ClimberRank } from "../contexts/AppDataContext";

export function formatHeight(ft: number): string {
  return `${ft.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${ALTITUDE_UNIT}`;
}

export type Standing =
  | { kind: "ranked"; rank: number; detail: string }
  | { kind: "hidden" }
  | { kind: "unranked" };

/**
 * What the "You're #N" banner says. `climbers` is the public (opted-in) top
 * list; `own` is the player's record from the dashboard, whose rank counts
 * every climber, so the list position wins whenever the player is on it.
 */
export function standingFor(
  climbers: ClimberRank[],
  meId: string | null,
  own: { peakY: number; rank: number } | null,
  onPublicBoard: boolean,
): Standing {
  const i = meId ? climbers.findIndex((c) => c.userId === meId) : -1;
  if (i >= 0) {
    const me = climbers[i];
    if (i === 0) {
      const next = climbers[1];
      if (!next) return { kind: "ranked", rank: 1, detail: "No one else on the board yet" };
      const lead = me.peakY - next.peakY;
      return {
        kind: "ranked",
        rank: 1,
        detail: lead > 0 ? `${formatHeight(lead)} ahead of #2` : "Tied with #2",
      };
    }
    const above = climbers[i - 1];
    const gap = above.peakY - me.peakY;
    return {
      kind: "ranked",
      rank: me.rank,
      detail: gap > 0 ? `${formatHeight(gap)} behind #${above.rank}` : `Tied with #${above.rank}`,
    };
  }
  if (!own) return { kind: "unranked" };
  if (!onPublicBoard) return { kind: "hidden" };
  const last = climbers[climbers.length - 1];
  const gap = last ? last.peakY - own.peakY : 0;
  return {
    kind: "ranked",
    rank: own.rank,
    detail:
      last && gap > 0
        ? `${formatHeight(gap)} to reach the top ${climbers.length}`
        : `Just outside the top ${climbers.length}`,
  };
}

/** Up to two initials from a display name ("Golden Heron 31" → "GH"). */
export function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .map((w) => w.match(/\p{L}/u)?.[0] ?? "")
    .filter(Boolean);
  return (letters.slice(0, 2).join("") || "?").toUpperCase();
}

const TINTS = ["#cbf24d", "#ff5a2c", "#ffb020", "#4dd6f2", "#b07cd6", "#ff6b9d", "#8fd14f", "#6b8cff"];

/** Stable accent colour for a climber's avatar badge. */
export function tintFor(userId: string): string {
  return TINTS[hashId(userId) % TINTS.length];
}
