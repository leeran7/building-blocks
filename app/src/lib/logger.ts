/**
 * Structured logger for Tower.
 * Writes separate entries for raw, qualified, and credited views (AC-14).
 */

export type LogType =
  | "view_raw"
  | "view_qualified"
  | "view_credited"
  | "admin_action"
  | "payment_webhook"
  | "error";

export interface ViewRawEntry {
  type: "view_raw";
  ip_hash: string;
  session_bucket: number;
  ua_snippet: string;
  reason: string; // why it didn't qualify
  timestamp: string;
}

export interface ViewQualifiedEntry {
  type: "view_qualified";
  ip_hash: string;
  session_bucket: number;
  timestamp: string;
}

export interface ViewCreditedEntry {
  type: "view_credited";
  views_k_new: number;
  timestamp: string;
}

export type LogEntry = ViewRawEntry | ViewQualifiedEntry | ViewCreditedEntry | {
  type: "admin_action" | "payment_webhook" | "error";
  [key: string]: unknown;
};

/** Simple hash for IP (one-way — no PII in logs) */
export function hashIp(ip: string): string {
  // Simple deterministic hash — not cryptographic, just for log correlation
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    hash = (hash << 5) - hash + ip.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

/** Truncate UA for log (no PII beyond first 80 chars) */
export function truncateUa(ua: string | null | undefined): string {
  if (!ua) return "(empty)";
  return ua.length > 80 ? ua.slice(0, 80) + "..." : ua;
}

/** Write a log entry to stdout as JSON */
export function log(entry: LogEntry): void {
  try {
    console.log(JSON.stringify(entry));
  } catch {
    console.log("[logger] Failed to serialize log entry");
  }
}

/** Log a raw view (did not qualify) */
export function logRaw(
  ip: string,
  sessionBucket: number,
  ua: string | null | undefined,
  reason: string
): void {
  log({
    type: "view_raw",
    ip_hash: hashIp(ip),
    session_bucket: sessionBucket,
    ua_snippet: truncateUa(ua),
    reason,
    timestamp: new Date().toISOString(),
  });
}

/** Log a qualified view (passed all filters, within ceiling) */
export function logQualified(ip: string, sessionBucket: number): void {
  log({
    type: "view_qualified",
    ip_hash: hashIp(ip),
    session_bucket: sessionBucket,
    timestamp: new Date().toISOString(),
  });
}

/** Log a credited view (applied to season_state.views_k) */
export function logCredited(views_k_new: number): void {
  log({
    type: "view_credited",
    views_k_new,
    timestamp: new Date().toISOString(),
  });
}
