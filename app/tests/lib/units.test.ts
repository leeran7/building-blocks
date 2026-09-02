/**
 * Altitude display units — US customary feet, 1:1 with stored height.
 */

import { describe, it, expect } from "vitest";
import {
  ALTITUDE_UNIT,
  ALTITUDE_UNIT_LONG,
  SEASON_START_RATE,
  formatAltitude,
  formatAltitudeLabel,
} from "../../src/lib/units";

describe("altitude display units", () => {
  it("labels height in feet, not metres", () => {
    expect(ALTITUDE_UNIT).toBe("ft");
    expect(ALTITUDE_UNIT_LONG).toBe("feet");
    expect(SEASON_START_RATE).toBe("$1 = 1ft");
  });

  it("formats compact readouts without a space", () => {
    expect(formatAltitude(418.2, 1)).toBe("418.2ft");
    expect(formatAltitude(12.345, 2)).toBe("12.35ft");
    expect(formatAltitude(180, 0)).toBe("180ft");
  });

  it("formats spoken labels with the long unit", () => {
    expect(formatAltitudeLabel(5.0, 1)).toBe("5.0 feet");
    expect(formatAltitudeLabel(0.65, 2)).toBe("0.65 feet");
  });
});
