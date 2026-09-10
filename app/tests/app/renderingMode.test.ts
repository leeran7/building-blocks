/**
 * Data-backed pages must declare their own rendering mode.
 *
 * A page whose body content comes from a database read must export its own
 * `revalidate` (or `dynamic`) rather than relying on caching inherited from
 * elsewhere in the tree.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Statically-rendered pages whose body content comes from the database. Routes
 * with a dynamic segment or searchParams are server-rendered on demand already.
 */
const DATA_BACKED_STATIC_PAGES = ["app/page.tsx", "app/climb/page.tsx"];

describe("data-backed static pages declare a rendering mode", () => {
  it.each(DATA_BACKED_STATIC_PAGES)("%s exports revalidate or dynamic", (page) => {
    const src = readFileSync(resolve(__dirname, "../../", page), "utf-8");
    expect(src).toMatch(/export const (revalidate|dynamic)\s*=/);
  });
});

describe("the free climb leaderboard separates empty from broken", () => {
  const src = readFileSync(resolve(__dirname, "../../app/climb/page.tsx"), "utf-8");

  it("does not swallow a failed read into an empty array", () => {
    // topFreeClimbers(50).catch(() => []) rendered a database outage as
    // "no climbers yet". `next build` with no database reachable still exits 0,
    // so that state used to be what shipped.
    expect(src).not.toMatch(/catch\(\(\)\s*=>\s*\[\]\)/);
  });

  it("passes an explicit unavailable flag to the leaderboard", () => {
    expect(src).toContain("unavailable=");
  });
});
