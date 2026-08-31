/**
 * AC-35, AC-36 — robots allow-list and sitemap with zero /r/ rows.
 */

import { describe, expect, it } from "vitest";
import { getRobotsConfig } from "../../src/seo/robotsConfig";
import { buildSitemapEntries } from "../../src/seo/sitemapEntries";
import robots, { dynamic as robotsDynamic } from "../../app/robots";
import { PROD_ORIGIN } from "../share/fixtures";

function allowList(config: ReturnType<typeof getRobotsConfig>): string[] {
  const rules = Array.isArray(config.rules) ? config.rules : [config.rules];
  return rules.flatMap((r) => {
    const a = r.allow;
    if (a == null) return [];
    return Array.isArray(a) ? a : [a];
  });
}

function disallowList(config: ReturnType<typeof getRobotsConfig>): string[] {
  const rules = Array.isArray(config.rules) ? config.rules : [config.rules];
  return rules.flatMap((r) => {
    const d = r.disallow;
    if (d == null) return [];
    return Array.isArray(d) ? d : [d];
  });
}

describe("getRobotsConfig (AC-35)", () => {
  it("allows marketing paths, /r/, and /api/og, and does not Disallow /r/", () => {
    const config = getRobotsConfig(PROD_ORIGIN);
    const allows = allowList(config);
    for (const path of ["/", "/play", "/climb", "/b/", "/r/", "/api/og"]) {
      expect(allows).toContain(path);
    }
    const disallow = disallowList(config);
    expect(disallow).not.toContain("/r/");
    expect(disallow.some((d) => d === "/r/" || d.startsWith("/r/"))).toBe(false);
    expect(config.sitemap).toBe(`${PROD_ORIGIN}/sitemap.xml`);
  });

  it("is invoked by app/robots.ts (non-test caller) and still allows /r/", () => {
    const fromRoute = robots();
    expect(allowList(fromRoute)).toContain("/r/");
    expect(disallowList(fromRoute)).not.toContain("/r/");
    expect(robotsDynamic).toBe("force-dynamic");
  });
});

describe("buildSitemapEntries (AC-36)", () => {
  it("includes home, play, climb, and /b/{slug}, with zero /r/ paths", () => {
    const entries = buildSitemapEntries(PROD_ORIGIN, [
      "alpha-stack",
      "beta-stack",
    ]);
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`${PROD_ORIGIN}/`);
    expect(urls).toContain(`${PROD_ORIGIN}/play`);
    expect(urls).toContain(`${PROD_ORIGIN}/climb`);
    expect(urls).toContain(`${PROD_ORIGIN}/b/alpha-stack`);
    expect(urls).toContain(`${PROD_ORIGIN}/b/beta-stack`);
    for (const entry of entries) {
      const path = new URL(entry.url).pathname;
      expect(path.startsWith("/r/")).toBe(false);
    }
  });

  it("still emits the three static marketing URLs when slug list is empty", () => {
    const urls = buildSitemapEntries(PROD_ORIGIN, []).map((e) => e.url);
    expect(urls).toEqual([
      `${PROD_ORIGIN}/`,
      `${PROD_ORIGIN}/play`,
      `${PROD_ORIGIN}/climb`,
    ]);
  });

  it("never invents /r/ rows from block slugs", () => {
    const sneaky = buildSitemapEntries(PROD_ORIGIN, ["r", "recording"]);
    for (const e of sneaky) {
      expect(new URL(e.url).pathname.startsWith("/r/")).toBe(false);
    }
  });
});
