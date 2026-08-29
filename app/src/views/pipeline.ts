/**
 * View-counting pipeline — orchestrates all steps.
 *
 * Runs on the server only (Next.js middleware or server component).
 * NEVER called from client-side code.
 *
 * Returns ViewResult with counts for logging.
 */

import { isBot } from "./botList";
import { checkIpCap, hourBucket } from "./ipCap";
import { checkSessionDedup, thirtyMinBucket } from "./sessionDedup";
import { checkGlobalCeiling } from "./globalCeiling";
import { creditView } from "./creditView";
import { logRaw, logQualified, logCredited } from "../lib/logger";

export interface ViewResult {
  /** Total raw page loads counted */
  raw: number;
  /** Views that passed bot + IP + session filters */
  qualified: number;
  /** Views that passed the global ceiling and were credited to V */
  credited: number;
  /** New views_k after credit (null if not credited) */
  views_k_new: number | null;
}

export interface PipelineRequest {
  /** Client IP address */
  ip: string;
  /** User-agent string */
  ua: string | null | undefined;
  /** Session ID (tid cookie) */
  sessionId: string;
  /** The stack this view is credited to. Partitions session dedup. */
  category: string;
}

export interface PipelineDeps {
  /** Redis client */
  redis: {
    incr: (key: string) => Promise<number>;
    expire: (key: string, ttl: number) => Promise<number>;
    set: (
      key: string,
      value: string,
      options: { nx: true; ex: number }
    ) => Promise<string | null>;
  };
  /** DB accessor for crediting views */
  db: {
    updateSeasonViews: () => Promise<number>;
  };
}

/**
 * Run the full view-counting pipeline.
 *
 * Steps:
 * 1. Log raw view
 * 2. Bot filter
 * 3. Per-IP cap
 * 4. Session dedup
 * 5. Global ceiling
 * 6. Credit view to season_state
 *
 * @param req - request metadata
 * @param deps - Redis and DB dependencies (injectable for testing)
 * @returns ViewResult
 */
export async function runViewPipeline(
  req: PipelineRequest,
  deps: PipelineDeps
): Promise<ViewResult> {
  const bucket30 = thirtyMinBucket();
  const bucketHour = hourBucket();

  // Step 1: Always count raw
  // (raw count handled via log entries)

  // Step 2: Bot filter
  if (isBot(req.ua)) {
    logRaw(req.ip, bucket30, req.ua, "bot_ua");
    return { raw: 1, qualified: 0, credited: 0, views_k_new: null };
  }

  // Step 3: Per-IP cap (atomic Redis INCR). Deliberately NOT partitioned by
  // category: it is an abuse control on the IP, and per-stack keys would give
  // one address IP_CAP_LIMIT views per stack instead of per hour.
  const ipResult = await checkIpCap(deps.redis, req.ip);
  if (!ipResult.allowed) {
    logRaw(req.ip, bucket30, req.ua, "ip_cap_exceeded");
    return { raw: 1, qualified: 0, credited: 0, views_k_new: null };
  }

  // Step 4: Session dedup (Redis SETNX), scoped to this stack — the same
  // visitor browsing two stacks is two credits, one per stack's views_k.
  const isNewSession = await checkSessionDedup(
    deps.redis,
    req.sessionId,
    req.category
  );
  if (!isNewSession) {
    logRaw(req.ip, bucket30, req.ua, "session_duplicate");
    return { raw: 1, qualified: 0, credited: 0, views_k_new: null };
  }

  // Step 5: Global ceiling check (atomic Redis INCR). Also deliberately global:
  // CEIL_PER_HOUR is the hard cap on inflation across the whole site (NFR-S5),
  // and per-stack keys would multiply it by the number of stacks. The tradeoff
  // is that one very popular stack can consume the hour's budget; splitting a
  // per-stack allowance under this cap is a product decision, not a bug fix.
  const ceilResult = await checkGlobalCeiling(deps.redis, bucketHour);
  if (!ceilResult.allowed) {
    logRaw(req.ip, bucket30, req.ua, "global_ceiling_exceeded");
    logQualified(req.ip, bucket30); // qualified but not credited
    return { raw: 1, qualified: 1, credited: 0, views_k_new: null };
  }

  // Step 6: Credit view to season_state (DB transaction)
  logQualified(req.ip, bucket30);
  const { views_k_new } = await creditView(deps.db);
  logCredited(views_k_new);

  return { raw: 1, qualified: 1, credited: 1, views_k_new };
}
