import { hashId } from "@app/lib/handle";
import { ALTITUDE_UNIT } from "@app/lib/units";
import { parseAvatarId } from "@app/lib/avatars";
import type { ClimberRank, FriendsBoard } from "../contexts/AppDataContext";

export function formatHeight(ft: number): string {
  return `${ft.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${ALTITUDE_UNIT}`;
}

/** The fields a board row needs for ranking UI — shared by all-time and daily rows. */
export interface BoardRow {
  rank: number;
  userId: string;
  handle: string;
  peakY: number;
  avatarId: string | null;
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
  climbers: readonly BoardRow[],
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

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/**
 * The line under the Friends board accounting for friends who aren't on it:
 * opted out of leaderboards (hidden) or no climb yet. Null when there are none.
 */
export function friendsFooter(hiddenCount: number, notClimbedCount: number): string | null {
  const notClimbed =
    notClimbedCount > 0 ? plural(notClimbedCount, "friend hasn't climbed yet", "friends haven't climbed yet") : null;
  if (hiddenCount <= 0) return notClimbed;
  if (notClimbed) return `${notClimbed} · ${hiddenCount.toLocaleString()} hidden`;
  return plural(hiddenCount, "friend is hidden", "friends are hidden");
}

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

type RawClimber = Omit<ClimberRank, "avatarId"> & { avatarId?: unknown };

function isRawClimber(v: unknown): v is RawClimber {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.rank === "number" &&
    typeof c.userId === "string" &&
    typeof c.handle === "string" &&
    (c.username === null || typeof c.username === "string") &&
    typeof c.peakY === "number" &&
    typeof c.wins === "number"
  );
}

// Absent is allowed so a server that predates avatars still parses.
const isAvatarField = (v: unknown): v is string | null | undefined =>
  v === undefined || v === null || typeof v === "string";

/** Validates a GET /api/climb/leaderboard/friends body; null if malformed. */
export function parseFriendsBoard(body: unknown): FriendsBoard | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.climbers)) return null;
  const climbers: ClimberRank[] = [];
  for (const raw of b.climbers) {
    if (!isRawClimber(raw) || !isAvatarField(raw.avatarId)) return null;
    // A string that is not a catalogue id (retired, or never valid) reads as
    // null here, the same allow-list settingsFromResponse applies.
    climbers.push({ ...raw, avatarId: parseAvatarId(raw.avatarId) });
  }
  if (!isCount(b.hiddenCount) || !isCount(b.notClimbedCount)) return null;
  return { climbers, hiddenCount: b.hiddenCount, notClimbedCount: b.notClimbedCount };
}
