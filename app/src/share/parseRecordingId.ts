/**
 * Allow-list parser for public recording ids (`ClimbRun.id`).
 * Reject never default: invalid input returns null, never a demo id.
 */

const RECORDING_ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

const OBJECT_PROTO_KEYS = new Set(
  Object.getOwnPropertyNames(Object.prototype).map((k) => k.toLowerCase())
);
OBJECT_PROTO_KEYS.add("__proto__");

export function parseRecordingId(
  raw: string | undefined | null
): string | null {
  if (typeof raw !== "string") return null;
  if (raw !== raw.trim()) return null;
  if (!raw) return null;
  if (raw.includes("/") || raw.includes(".") || raw.includes("%")) return null;
  const id = raw.toLowerCase();
  if (!RECORDING_ID_RE.test(id) || OBJECT_PROTO_KEYS.has(id)) return null;
  return id;
}
