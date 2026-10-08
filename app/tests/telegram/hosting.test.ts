/**
 * The Telegram build's hosting (mobile/src/targets/telegram/hosting.cjs) and
 * how next.config.js merges it: the bundle's asset URLs resolve under
 * /play/telegram, /play/telegram serves its index.html, and only that path
 * gets the CSP that lets Telegram Web frame it.
 */

import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const appDir = path.resolve(import.meta.dirname, "../..");

interface HeaderEntry {
  source: string;
  headers: { key: string; value: string }[];
}
interface Rewrite {
  source: string;
  destination: string;
}
interface Hosting {
  path: string;
  base: string;
  rewrites: Rewrite[];
  headers: HeaderEntry[];
}
interface NextConfig {
  headers(): Promise<HeaderEntry[]>;
  rewrites(): Promise<Rewrite[]>;
}

const hosting = require(path.join(appDir, "mobile/src/targets/telegram/hosting.cjs")) as Hosting;
const nextConfig = require(path.join(appDir, "next.config.js")) as NextConfig;

/** Directive name -> sources, from a CSP string. */
function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp
      .split(";")
      .map((d) => d.trim().split(/\s+/))
      .filter((parts) => parts[0] !== "")
      .map(([name, ...sources]) => [name, sources])
  );
}

const { getPathMatch } = require("next/dist/shared/lib/router/utils/path-match") as {
  getPathMatch(source: string): (pathname: string) => Record<string, unknown> | false;
};

/** Whether a header `source` applies to `pathname`, by Next's own matcher. */
function sourceMatches(source: string, pathname: string): boolean {
  return getPathMatch(source)(pathname) !== false;
}

/** The effective value of `key` for `pathname`: the last matching entry wins, as in Next. */
function effectiveHeader(entries: HeaderEntry[], pathname: string, key: string): string | undefined {
  let value: string | undefined;
  for (const entry of entries) {
    if (!sourceMatches(entry.source, pathname)) continue;
    for (const h of entry.headers) if (h.key.toLowerCase() === key.toLowerCase()) value = h.value;
  }
  return value;
}

describe("telegram hosting.cjs", () => {
  it("serves under /play/telegram with absolute asset URLs (the page URL has no trailing slash)", () => {
    expect(hosting.path).toBe("/play/telegram");
    expect(hosting.base).toBe("/play/telegram/");
    // What the browser does with the built <script src> at the Mini App URL.
    const page = "https://www.doomstack.lol/play/telegram";
    expect(new URL(`${hosting.base}assets/index.js`, page).pathname).toBe("/play/telegram/assets/index.js");
  });

  it("rewrites the folder URL to its index.html", () => {
    expect(hosting.rewrites).toEqual([{ source: "/play/telegram", destination: "/play/telegram/index.html" }]);
  });

  it("lets only Telegram Web frame it, and loads Telegram's script", () => {
    const csp = effectiveHeader(hosting.headers, "/play/telegram", "Content-Security-Policy");
    expect(csp).toBeDefined();
    const d = directives(csp!);
    expect(d.get("frame-ancestors")).toEqual(["https://web.telegram.org", "https://*.web.telegram.org"]);
    expect(d.get("script-src")).toContain("https://telegram.org");
    expect(d.get("script-src")).not.toContain("'unsafe-eval'");
    expect(d.get("connect-src")).toEqual(
      expect.arrayContaining(["'self'", "https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com"])
    );
    expect(d.get("object-src")).toEqual(["'none'"]);
    // The bundle's smallest font subsets are inlined by Vite as data: URIs.
    expect(d.get("font-src")).toEqual(["'self'", "data:"]);
  });
});

describe("next.config.js merges the telegram hosting", () => {
  it("includes the /play/telegram rewrite alongside the site's own", async () => {
    const rewrites = await nextConfig.rewrites();
    expect(rewrites).toContainEqual({ source: "/play/telegram", destination: "/play/telegram/index.html" });
    expect(rewrites.some((r) => r.source === "/__/auth/:path*")).toBe(true);
  });

  it("gives /play/telegram and its assets the Telegram CSP, overriding the site-wide one", async () => {
    const headers = await nextConfig.headers();
    for (const p of ["/play/telegram", "/play/telegram/index.html", "/play/telegram/assets/index-abc.js"]) {
      const csp = effectiveHeader(headers, p, "Content-Security-Policy");
      expect(directives(csp!).get("frame-ancestors"), p).toEqual(["https://web.telegram.org", "https://*.web.telegram.org"]);
    }
  });

  it("leaves every other page on the site-wide CSP, which Telegram cannot frame", async () => {
    const headers = await nextConfig.headers();
    for (const p of ["/", "/play", "/play/telegramx", "/play/discord", "/api/auth/telegram"]) {
      const csp = effectiveHeader(headers, p, "Content-Security-Policy");
      expect(csp, p).toBeDefined();
      expect(directives(csp!).has("frame-ancestors"), p).toBe(false);
      expect(effectiveHeader(headers, p, "X-Frame-Options"), p).toBe("SAMEORIGIN");
    }
  });
});
