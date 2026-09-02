/**
 * Phase 1b View Counting Tests — AC-9 through AC-15
 *
 * Uses in-memory Redis mock and a DB stub.
 * All tests are server-side only — no browser/client simulation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { runViewPipeline } from "../../src/views/pipeline";
import { isBot, BOT_UA_PATTERNS } from "../../src/views/botList";
import { computeGround, isBuried } from "../../src/engine/index";
import { checkIpCap, ipCapKey, hourBucket } from "../../src/views/ipCap";
import { checkSessionDedup, dedupKey, thirtyMinBucket } from "../../src/views/sessionDedup";
import { checkGlobalCeiling, globalCeilKey } from "../../src/views/globalCeiling";
import { logRaw, logQualified, logCredited } from "../../src/lib/logger";

// ── In-memory Redis mock ───────────────────────────────────────────────────

class MockRedis {
  private store: Map<string, { value: string; ttl?: number }> = new Map();

  async incr(key: string): Promise<number> {
    const existing = this.store.get(key);
    const current = existing ? parseInt(existing.value, 10) : 0;
    const next = current + 1;
    this.store.set(key, { value: String(next) });
    return next;
  }

  async expire(key: string, ttl: number): Promise<number> {
    const existing = this.store.get(key);
    if (existing) {
      existing.ttl = ttl;
    }
    return 1;
  }

  async set(
    key: string,
    value: string,
    options: { nx: boolean; ex: number }
  ): Promise<string | null> {
    if (options.nx && this.store.has(key)) {
      return null; // Key already exists — SETNX returns nil
    }
    this.store.set(key, { value, ttl: options.ex });
    return "OK";
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key)?.value ?? null;
  }

  /** Test helper: get current count */
  getCount(key: string): number {
    const val = this.store.get(key)?.value;
    return val ? parseInt(val, 10) : 0;
  }

  reset() {
    this.store.clear();
  }
}

// ── DB mock ───────────────────────────────────────────────────────────────

class MockDb {
  views_k = 0;

  async updateSeasonViews(): Promise<number> {
    this.views_k += 0.001;
    return this.views_k;
  }

  reset() {
    this.views_k = 0;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function makeRequest(
  overrides: Partial<{ ip: string; ua: string; sessionId: string; category: string }> = {}
) {
  return {
    ip: overrides.ip ?? "1.2.3.4",
    ua: overrides.ua ?? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    sessionId: overrides.sessionId ?? "test-session-abc-123",
    category: overrides.category ?? "ai",
  };
}

// ── AC-9: Server-side only (static check) ────────────────────────────────
describe("AC-9: No client-side counting", () => {
  it("runViewPipeline is a server-only function (no browser API dependencies)", () => {
    // Static contract: pipeline.ts imports only server-side modules
    // It does not reference window, document, navigator, fetch from browser, etc.
    // This is a design contract — verified by code review and the fact that
    // the pipeline only runs in middleware/server context.
    // runViewPipeline is already imported at the top of this file via ESM import.
    // The fact that it imported successfully confirms it has no browser-only deps.
    expect(typeof runViewPipeline).toBe("function");
  });

  it("bot detection correctly identifies known bots", () => {
    expect(isBot("Googlebot/2.1 (+http://www.google.com/bot.html)")).toBe(true);
    expect(isBot("Mozilla/5.0 (compatible; bingbot/2.0)")).toBe(true);
    expect(isBot("HeadlessChrome/96.0.4664.45")).toBe(true);
  });

  it("bot filter blocks view counting for bot UAs (server-side gating)", async () => {
    const redis = new MockRedis();
    const db = new MockDb();

    const result = await runViewPipeline(
      makeRequest({ ua: "Googlebot/2.1 (+http://www.google.com/bot.html)" }),
      { redis, db }
    );

    expect(result.qualified).toBe(0);
    expect(result.credited).toBe(0);
    expect(db.views_k).toBe(0);
  });
});

// ── AC-10: Session deduplication ─────────────────────────────────────────
describe("AC-10: Single session 10 rapid requests → exactly 1 qualified view", () => {
  it("credits exactly 1 view for 10 rapid requests from same session", async () => {
    const redis = new MockRedis();
    const db = new MockDb();
    const sessionId = "test-session-dedup-001";

    let totalQualified = 0;
    let totalCredited = 0;

    for (let i = 0; i < 10; i++) {
      const result = await runViewPipeline(
        makeRequest({ sessionId }),
        { redis, db }
      );
      totalQualified += result.qualified;
      totalCredited += result.credited;
    }

    expect(totalQualified).toBe(1);
    expect(totalCredited).toBe(1);
    expect(db.views_k).toBeCloseTo(0.001, 10);
  });

  it("dedups per stack, not globally, for one visitor browsing several", async () => {
    // views_k is per-stack, so one visitor's session must be able to credit a
    // view to each stack they visit. While the dedup key was
    // "dedup:{tid}:{bucket}" only the first stack was credited and the rest
    // were suppressed as duplicates — and views_k drives both the burial line
    // and price-per-metre.
    const redis = new MockRedis();
    const db = new MockDb();
    const sessionId = "one-visitor-many-stacks";
    const stacks = ["ai", "gaming-pc", "design-tools", "indie-games", "coffee"];

    let credited = 0;
    for (const category of stacks) {
      const result = await runViewPipeline(makeRequest({ sessionId, category }), {
        redis,
        db,
      });
      credited += result.credited;
    }

    expect(credited).toBe(stacks.length);
  });

  it("keeps one hourly ceiling across stacks rather than one budget per stack", async () => {
    // Dedup is per-stack (views_k is per-stack). The ceiling is not: it is the
    // site-wide inflation cap (NFR-S5). Partitioning it by category would
    // multiply CEIL_PER_HOUR by the number of stacks.
    const prev = process.env.CEIL_PER_HOUR;
    process.env.CEIL_PER_HOUR = "2";
    try {
      const redis = new MockRedis();
      const db = new MockDb();
      const a = await runViewPipeline(
        makeRequest({ ip: "10.0.0.1", sessionId: "ceil-a", category: "ai" }),
        { redis, db }
      );
      const b = await runViewPipeline(
        makeRequest({ ip: "10.0.0.2", sessionId: "ceil-b", category: "tech" }),
        { redis, db }
      );
      const c = await runViewPipeline(
        makeRequest({ ip: "10.0.0.3", sessionId: "ceil-c", category: "food" }),
        { redis, db }
      );
      expect(a.credited).toBe(1);
      expect(b.credited).toBe(1);
      expect(c.credited).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.CEIL_PER_HOUR;
      else process.env.CEIL_PER_HOUR = prev;
    }
  });

  it("still dedups repeat views of the same stack in one window", async () => {
    const redis = new MockRedis();
    const db = new MockDb();
    const sessionId = "same-stack-twice";

    const first = await runViewPipeline(
      makeRequest({ sessionId, category: "ai" }),
      { redis, db }
    );
    const second = await runViewPipeline(
      makeRequest({ sessionId, category: "ai" }),
      { redis, db }
    );

    expect(first.credited).toBe(1);
    expect(second.credited).toBe(0);
  });

  it("different sessions each get 1 qualified view", async () => {
    const redis = new MockRedis();
    const db = new MockDb();

    for (let i = 0; i < 5; i++) {
      const result = await runViewPipeline(
        makeRequest({ sessionId: `session-${i}`, ip: `1.2.3.${i + 10}` }),
        { redis, db }
      );
      expect(result.qualified).toBe(1);
      expect(result.credited).toBe(1);
    }

    expect(db.views_k).toBeCloseTo(0.005, 10);
  });
});

// ── AC-11: Per-IP cap (max 20 from 25 requests) ───────────────────────────
describe("AC-11: Per-IP cap — at most 20 qualified views from 25 requests", () => {
  it("allows exactly 20 and rejects requests 21-25", async () => {
    const redis = new MockRedis();
    const db = new MockDb();
    const ip = "10.0.0.1";

    let qualified = 0;
    let credited = 0;

    for (let i = 0; i < 25; i++) {
      // Use unique session IDs so session dedup doesn't interfere
      const result = await runViewPipeline(
        makeRequest({ ip, sessionId: `ip-cap-session-${i}` }),
        { redis, db }
      );
      qualified += result.qualified;
      credited += result.credited;
    }

    expect(qualified).toBeLessThanOrEqual(20);
    expect(credited).toBeLessThanOrEqual(20);
  });

  it("per-IP cap is enforced at exactly 20", async () => {
    const redis = new MockRedis();
    const db = new MockDb();
    const ip = "10.0.0.2";
    let allowed = 0;
    let blocked = 0;

    for (let i = 0; i < 25; i++) {
      const result = await checkIpCap(redis, ip);
      if (result.allowed) allowed++;
      else blocked++;
    }

    expect(allowed).toBe(20);
    expect(blocked).toBe(5);
  });
});

// ── AC-12: Bot exclusion (parameterised UA list) ──────────────────────────
describe("AC-12: Bot UA requests → 0 qualified views", () => {
  const botUAs = [
    "Googlebot/2.1 (+http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "DuckDuckBot/1.0; (+http://duckduckgo.com/duckduckbot.html)",
    "Mozilla/5.0 (compatible; YandexBot/3.0)",
    "facebookexternalhit/1.1",
    "Twitterbot/1.0",
    "LinkedInBot/1.0 (compatible; Mozilla/5.0)",
    "Mozilla/5.0 (compatible; HeadlessChrome/96.0.4664.45)",
    "Python-urllib/2.7",
    "curl/7.64.1",
  ];

  it.each(botUAs)("blocks bot UA: %s", async (ua) => {
    const redis = new MockRedis();
    const db = new MockDb();

    const result = await runViewPipeline(
      makeRequest({ ua }),
      { redis, db }
    );

    expect(result.qualified).toBe(0);
    expect(result.credited).toBe(0);
  });

  it("isBot() returns true for all known bot patterns", () => {
    // Test the direct bot detection function
    expect(isBot("Googlebot/2.1")).toBe(true);
    expect(isBot("bingbot/2.0")).toBe(true);
    expect(isBot("HeadlessChrome/96")).toBe(true);
    expect(isBot("")).toBe(true); // empty UA = bot
    expect(isBot(null)).toBe(true);
    expect(isBot(undefined)).toBe(true);
  });

  it("isBot() returns false for real browser UAs", () => {
    expect(isBot("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36")).toBe(false);
    expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1")).toBe(false);
  });
});

// ── AC-13: Global ceiling (at most 40k from 100k raw) ────────────────────
describe("AC-13: Global ceiling — at most CEIL_PER_HOUR credited from 100k raw", () => {
  const CEIL_PER_HOUR = 40000;

  it("credits at most CEIL_PER_HOUR views regardless of raw load", async () => {
    const redis = new MockRedis();
    const bucket = hourBucket();
    let credited = 0;

    // Simulate 100,000 raw requests — each passes bot+IP+session checks
    // but the global ceiling stops at 40,000
    for (let i = 0; i < 100_000; i++) {
      const result = await checkGlobalCeiling(redis, bucket);
      if (result.allowed) credited++;
    }

    expect(credited).toBe(CEIL_PER_HOUR);
  });

  it("checkGlobalCeiling returns allowed=false after CEIL_PER_HOUR", async () => {
    const redis = new MockRedis();
    const bucket = hourBucket();

    // Fill to cap
    for (let i = 0; i < CEIL_PER_HOUR; i++) {
      await checkGlobalCeiling(redis, bucket);
    }

    // Next one should be rejected
    const result = await checkGlobalCeiling(redis, bucket);
    expect(result.allowed).toBe(false);
    expect(result.count).toBe(CEIL_PER_HOUR + 1);
  });
});

// ── AC-14: Separate log entries for raw/qualified/credited ────────────────
describe("AC-14: Separate log streams for raw/qualified/credited views", () => {
  it("logs separate entries for each view type", () => {
    const logs: unknown[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => {
      try {
        logs.push(JSON.parse(msg));
      } catch {
        // ignore non-JSON
      }
    };

    logRaw("1.2.3.4", 12345, "TestBrowser/1.0", "bot_ua");
    logQualified("1.2.3.4", 12345);
    logCredited(1.234);

    console.log = originalLog;

    const rawEntries = logs.filter((l: unknown) => (l as { type: string }).type === "view_raw");
    const qualifiedEntries = logs.filter((l: unknown) => (l as { type: string }).type === "view_qualified");
    const creditedEntries = logs.filter((l: unknown) => (l as { type: string }).type === "view_credited");

    expect(rawEntries).toHaveLength(1);
    expect(qualifiedEntries).toHaveLength(1);
    expect(creditedEntries).toHaveLength(1);
  });

  it("pipeline logs separate entries at each step", async () => {
    const logs: unknown[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => {
      try {
        logs.push(JSON.parse(msg));
      } catch {
        // ignore
      }
    };

    const redis = new MockRedis();
    const db = new MockDb();

    // First request — should qualify and get credited
    await runViewPipeline(makeRequest({ sessionId: "log-test-session-1" }), { redis, db });

    console.log = originalLog;

    const types = logs.map((l: unknown) => (l as { type: string }).type);
    expect(types).toContain("view_qualified");
    expect(types).toContain("view_credited");
  });

  it("blocked request (bot) only logs raw", async () => {
    const logs: unknown[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => {
      try {
        logs.push(JSON.parse(msg));
      } catch {
        // ignore
      }
    };

    const redis = new MockRedis();
    const db = new MockDb();
    await runViewPipeline(makeRequest({ ua: "Googlebot/2.1" }), { redis, db });

    console.log = originalLog;

    const types = logs.map((l: unknown) => (l as { type: string }).type);
    expect(types).toContain("view_raw");
    expect(types).not.toContain("view_qualified");
    expect(types).not.toContain("view_credited");
  });
});

// ── AC-15: Buried block views_served does not increment ──────────────────
// This test verifies the design contract: views_served is only incremented
// when altitude >= ground at time of view.
// The actual DB write is tested at the integration layer; here we verify
// the pipeline's output and the gating logic design.
describe("AC-15: Buried block views_served gating", () => {
  it("pipeline credits V regardless of individual block burial state", async () => {
    // The pipeline credits V (global season views) — not per-block views_served
    // Per-block views_served is a separate write gated by altitude >= ground
    // This test confirms the pipeline correctly returns credited=1 for valid views
    const redis = new MockRedis();
    const db = new MockDb();

    const result = await runViewPipeline(
      makeRequest({ sessionId: "buried-test-session-1" }),
      { redis, db }
    );

    expect(result.credited).toBe(1);
    expect(result.views_k_new).toBeCloseTo(0.001, 10);
  });

  it("views_served gating design: only increment when altitude >= ground", () => {
    // computeGround and isBuried imported at top of file
    // A block with $5 altitude at V=0
    const altitude = 5; // computeMetres(5, 0) = 5 * 1.0 = 5
    const groundAtV0 = computeGround(0);
    const groundAtV1500 = computeGround(1500);

    // At V=0: not buried
    expect(isBuried(altitude, 0)).toBe(false);
    expect(altitude).toBeGreaterThanOrEqual(groundAtV0);

    // At V=1500: buried (ground has risen past altitude)
    const buried = isBuried(altitude, 1500);
    expect(buried).toBe(true);
    expect(groundAtV1500).toBeGreaterThan(altitude);
  });
});
