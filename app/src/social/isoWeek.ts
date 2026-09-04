/**
 * Minimal ISO-8601 week utilities. No dependency added — this is the whole
 * surface area the feature needs (format + week boundaries + "next week").
 */

function startOfIsoWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Monday = 1 ... Sunday = 7
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Formats a date as `"YYYY-Www"`, e.g. `"2026-W35"`. */
export function toIsoWeekString(date: Date): string {
  const target = new Date(date.getTime());
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3); // nearest Thursday, per ISO-8601 definition
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const weekNumber = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

export function currentIsoWeek(): string {
  return toIsoWeekString(new Date());
}

/** Returns `{ start, end }` (Mon 00:00:00 UTC .. following Mon 00:00:00 UTC, exclusive) for an ISO week string. */
export function isoWeekBounds(isoWeek: string): { start: Date; end: Date } {
  const [yearStr, weekStr] = isoWeek.split("-W");
  const year = Number(yearStr);
  const week = Number(weekStr);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week1Monday = startOfIsoWeek(jan4);
  const start = new Date(week1Monday.getTime() + (week - 1) * 7 * 86400000);
  const end = new Date(start.getTime() + 7 * 86400000);
  return { start, end };
}

/** The ISO week immediately following the given one (used for "the coming week"'s proposed calendar, AC-46). */
export function nextIsoWeek(isoWeek: string): string {
  const { end } = isoWeekBounds(isoWeek);
  return toIsoWeekString(end);
}

/** The ISO week immediately preceding the given one (used for the week-over-week delta, AC-45). */
export function previousIsoWeek(isoWeek: string): string {
  const { start } = isoWeekBounds(isoWeek);
  return toIsoWeekString(new Date(start.getTime() - 86400000));
}
