/**
 * Data-backed pages must declare their own rendering mode.
 *
 * Every route in this app inherits initialRevalidateSeconds = 60 from a single
 * fetch in app/layout.tsx's generateMetadata:
 *
 *     const res = await fetch(`${BASE_URL}/api/tower`, {
 *       next: { revalidate: 60 },
 *     });
 *
 * A segment takes the shortest revalidate of any fetch in its tree, so that one
 * line is what currently keeps the static pages fresh. Verified by changing it
 * to cache: "no-store" and rebuilding: /climb, /browse and /rules all drop out
 * of the prerender manifest entirely, which means prerendered once at build time
 * and never regenerated.
 *
 * So a page whose content comes from a database read must say so itself rather
 * than relying on an unrelated metadata fetch two levels up.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Statically-rendered pages whose body content comes from the database. Routes
 * with a dynamic segment or searchParams are server-rendered on demand already
 * — confirmed from the `next build` route table, where /b/[slug] and
 * /stack/[category] are marked dynamic.
 */
const DATA_BACKED_STATIC_PAGES = ["app/page.tsx", "app/climb/page.tsx"];

describe("data-backed static pages declare a rendering mode", () => {
  it.each(DATA_BACKED_STATIC_PAGES)("%s exports revalidate or dynamic", (page) => {
    const src = readFileSync(resolve(__dirname, "../../", page), "utf-8");
    expect(src).toMatch(/export const (revalidate|dynamic)\s*=/);
  });

  it("app/layout.tsx still carries the fetch every other route inherits from", () => {
    // Not an endorsement of the coupling — a canary. If this line changes,
    // check whether any page relied on it and now silently went static.
    const src = readFileSync(resolve(__dirname, "../../app/layout.tsx"), "utf-8");
    expect(src).toMatch(/next:\s*\{\s*revalidate:\s*\d+\s*\}/);
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
