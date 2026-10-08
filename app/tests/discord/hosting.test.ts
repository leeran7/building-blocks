/**
 * The Discord build's hosting (mobile/src/targets/discord/hosting.cjs) as the
 * site serves it: next.config.js's real headers() and rewrites(), matched with
 * Next's own path matcher, decide what /play/discord gets.
 */

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";

const require = createRequire(import.meta.url);

interface Header {
  key: string;
  value: string;
}
interface HeaderEntry {
  source: string;
  headers: Header[];
}
interface Rewrite {
  source: string;
  destination: string;
}
interface NextConfigLike {
  headers(): Promise<HeaderEntry[]>;
  rewrites(): Promise<Rewrite[]>;
}

const nextConfig = require("../../next.config.js") as NextConfigLike;
const hosting = require("../../mobile/src/targets/discord/hosting.cjs") as {
  path: string;
  base: string;
  rewrites: Rewrite[];
  headers: HeaderEntry[];
};

/** The headers Next sends for `path`: every matching entry in order, later keys overriding earlier. */
async function effectiveHeaders(path: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const entry of await nextConfig.headers()) {
    if (getPathMatch(entry.source)(path) === false) continue;
    for (const h of entry.headers) out.set(h.key.toLowerCase(), h.value);
  }
  return out;
}

/** Where the first matching rewrite sends `path`, or null. */
async function rewriteOf(path: string): Promise<string | null> {
  for (const r of await nextConfig.rewrites()) {
    const params = getPathMatch(r.source)(path);
    if (params === false) continue;
    return r.destination.replace(/:(\w+)\+?\*?/g, (_m, name: string) => {
      const v: unknown = params[name];
      return Array.isArray(v) ? v.join("/") : String(v);
    });
  }
  return null;
}

function directives(csp: string): Map<string, string> {
  return new Map(
    csp.split(";").map((d) => {
      const [name, ...rest] = d.trim().split(/\s+/);
      return [name, rest.join(" ")] as const;
    })
  );
}

describe("Discord hosting in next.config.js", () => {
  it("merges the Discord header entries into headers()", async () => {
    const all = await nextConfig.headers();
    for (const entry of hosting.headers) expect(all).toContainEqual(entry);
  });

  it("merges the Discord rewrites into rewrites()", async () => {
    const all = await nextConfig.rewrites();
    for (const r of hosting.rewrites) expect(all).toContainEqual(r);
  });

  it.each(["/play/discord", "/play/discord/assets/index-abc.js", "/play/discord/play/discord"])(
    "lets Discord frame %s and nothing else",
    async (path) => {
      const h = await effectiveHeaders(path);
      const csp = directives(h.get("content-security-policy") ?? "");
      expect(csp.get("frame-ancestors")).toBe("https://discord.com https://*.discord.com https://*.discordsays.com");
      // The site-wide SAMEORIGIN would block the Activity frame on browsers that still read it.
      expect(h.get("x-frame-options")).not.toBe("SAMEORIGIN");
      // Tighter than the site: no eval, no third-party scripts or frames.
      expect(csp.get("script-src")).toBe("'self'");
      expect(csp.get("frame-src")).toBe("'none'");
      expect(csp.get("object-src")).toBe("'none'");
    }
  );

  it("keeps the site-wide headers everywhere else", async () => {
    const h = await effectiveHeaders("/");
    expect(h.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(h.get("content-security-policy")).not.toContain("discordsays");
    const other = await effectiveHeaders("/play/telegram");
    expect(other.get("content-security-policy") ?? "").not.toContain("discord");
  });

  it("serves index.html at the entry, with or without Discord's doubled prefix", async () => {
    expect(await rewriteOf("/play/discord")).toBe("/play/discord/index.html");
    expect(await rewriteOf("/play/discord/play/discord")).toBe("/play/discord/index.html");
  });

  it("folds asset URLs requested through Discord's root mapping back onto the bundle", async () => {
    expect(await rewriteOf("/play/discord/play/discord/assets/index-abc.js")).toBe("/play/discord/assets/index-abc.js");
  });

  it("builds asset URLs under the hosted path", () => {
    expect(hosting.base).toBe(`${hosting.path}/`);
  });
});
