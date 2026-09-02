/**
 * Display unit for altitude.
 *
 * The engine stores abstract height (historically named metres). The product
 * shows US customary feet, 1:1 with stored values, so $1 still buys 1 unit at
 * season start.
 */

export const ALTITUDE_UNIT = "ft";
export const ALTITUDE_UNIT_LONG = "feet";
export const SEASON_START_RATE = `$1 = 1${ALTITUDE_UNIT}`;

export function formatAltitude(value: number, digits = 1): string {
  return `${value.toFixed(digits)}${ALTITUDE_UNIT}`;
}

export function formatAltitudeLabel(value: number, digits = 1): string {
  return `${value.toFixed(digits)} ${ALTITUDE_UNIT_LONG}`;
}
