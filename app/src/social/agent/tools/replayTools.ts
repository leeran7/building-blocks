import { analyzeClimbReplay } from "../../services/replayAnalysis";
import {
  listAllClimbReplays,
  clampReplayLimit,
  type ReplayCursor,
} from "../../../db/climb";
import { okResult, errResult } from "../../types";

export async function analyzeClimbReplayTool(input: { replayUrl: string }) {
  if (!input.replayUrl?.trim()) {
    return errResult("VALIDATION_ERROR", "replayUrl is required");
  }
  try {
    const analysis = await analyzeClimbReplay(input.replayUrl);
    return okResult(analysis);
  } catch (err) {
    return errResult("VALIDATION_ERROR", (err as Error).message);
  }
}

/**
 * Opaque paging cursor handed to/from the agent. Encodes BOTH the createdAt and
 * the row id so paging is stable across replays that share a created_at
 * millisecond. Neither an ISO timestamp nor a cuid contains "|", so a single
 * split cleanly recovers the two parts.
 */
const CURSOR_SEP = "|";

function encodeCursor(createdAtIso: string, id: string): string {
  return `${createdAtIso}${CURSOR_SEP}${id}`;
}

/** Returns the parsed cursor, or null when the string is malformed. */
function decodeCursor(before: string): ReplayCursor | null {
  const sep = before.indexOf(CURSOR_SEP);
  if (sep <= 0 || sep === before.length - 1) return null;
  const createdAtIso = before.slice(0, sep);
  const id = before.slice(sep + 1);
  const createdAt = new Date(createdAtIso);
  if (Number.isNaN(createdAt.getTime()) || !id.trim()) return null;
  return { createdAt, id };
}

/**
 * list_climb_replays — read-only. Lists climb replays across ALL users
 * (newest first) so the agent can discover a replay token to feed into
 * analyze_climb_replay. Admin-only via dispatchTool (AC-21).
 */
export async function listClimbReplaysTool(input: { limit?: number; before?: string }) {
  let cursor: ReplayCursor | undefined;
  if (input.before !== undefined) {
    const decoded = decodeCursor(input.before);
    if (!decoded) {
      return errResult(
        "VALIDATION_ERROR",
        "before must be an opaque cursor from a prior page's nextBefore (createdAt|id); it could not be parsed"
      );
    }
    cursor = decoded;
  }

  const effectiveLimit = clampReplayLimit(input.limit);
  const replays = await listAllClimbReplays({ limit: effectiveLimit, before: cursor });
  // A full page implies there may be more; hand back a composite keyset cursor
  // the agent can pass as `before` to page older. A short page means no more.
  const last = replays.length === effectiveLimit ? replays[replays.length - 1] : null;
  const nextBefore = last ? encodeCursor(last.createdAt, last.id) : null;
  return okResult({ replays, nextBefore });
}
