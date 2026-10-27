/**
 * Discord gem packs, server side (POST /api/gems/discord).
 *
 * A gem pack bought in the Discord Activity is a consumable SKU. Discord
 * records the purchase as an entitlement on the user. The server asks Discord
 * (with the bot token) for the user's entitlements, credits each unconsumed
 * one whose SKU is a gem pack in DISCORD_GEM_SKUS, then consumes it:
 *
 *   creditGemPack({ provider: "discord", externalId: entitlement.id }) -> consume
 *
 * Credit comes first so a failed consume only leaves the entitlement to be
 * seen again next time, where the credit is a no-op (unique on provider +
 * entitlement id) and the consume is retried. Nothing comes from the request:
 * the Discord user id is the signed-in uid's, and the SKU, pack, gem count and
 * entitlement id all come from Discord's answer and the server's own tables.
 *
 * Test-mode purchases and developer gifts cost nothing, so (like App Store
 * Sandbox purchases) they credit only the uids in DISCORD_TEST_PURCHASE_UIDS.
 *
 * Server-only (bot token, database).
 */

import { creditGemPack, gemBalance } from "../db/gems";
import type { GemPack } from "../lib/gemPacks";
import { platformUid } from "../lib/platformAuth";
import { isSnowflake, packForSku, parseGemSkuTable, type GemSkuTable } from "./discordSkus";
import { DISCORD_TIMEOUT_MS } from "./discordAuth";

export const DISCORD_API_V10 = "https://discord.com/api/v10";

/** Discord's page size cap for List Entitlements. */
export const ENTITLEMENT_PAGE_LIMIT = 100;
/** Pages read per settle; bounds the calls one request can make. */
export const MAX_ENTITLEMENT_PAGES = 10;

/** Entitlement types (Discord API). Only these may credit gems. */
export const ENTITLEMENT_TYPE = {
  PURCHASE: 1,
  DEVELOPER_GIFT: 3,
  TEST_MODE_PURCHASE: 4,
  USER_GIFT: 6,
} as const;

/** Paid for by a real user. */
const PAID_TYPES: ReadonlySet<number> = new Set([ENTITLEMENT_TYPE.PURCHASE, ENTITLEMENT_TYPE.USER_GIFT]);
/** Free to the buyer: credit only allow-listed test accounts. */
const TEST_TYPES: ReadonlySet<number> = new Set([ENTITLEMENT_TYPE.TEST_MODE_PURCHASE, ENTITLEMENT_TYPE.DEVELOPER_GIFT]);

export interface DiscordGemsEnv {
  applicationId: string;
  botToken: string;
  skus: GemSkuTable;
  /** Uids (discord:<id>) whose test purchases credit gems. */
  testUids: ReadonlySet<string>;
}

/** The gem settlement config, or null when the client id, bot token or SKU table is missing. */
export function discordGemsEnv(env: NodeJS.ProcessEnv = process.env): DiscordGemsEnv | null {
  const applicationId = env.DISCORD_CLIENT_ID?.trim();
  const botToken = env.DISCORD_BOT_TOKEN?.trim();
  const skus = parseGemSkuTable(env.DISCORD_GEM_SKUS);
  if (!applicationId || !isSnowflake(applicationId) || !botToken || Object.keys(skus).length === 0) return null;
  const testUids = new Set(
    (env.DISCORD_TEST_PURCHASE_UIDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.startsWith("discord:") && platformUid("discord", s.slice("discord:".length)) === s)
  );
  return { applicationId, botToken, skus, testUids };
}

/** The Discord user id behind a `discord:<id>` uid, or null for any other account. */
export function discordUserIdOf(uid: string): string | null {
  if (!uid.startsWith("discord:")) return null;
  const id = uid.slice("discord:".length);
  return platformUid("discord", id) === uid ? id : null;
}

/** An entitlement that may be credited now. */
export interface CreditableEntitlement {
  id: string;
  skuId: string;
  pack: GemPack;
  type: number;
}

export interface EntitlementContext {
  applicationId: string;
  discordUserId: string;
  skus: GemSkuTable;
  /** This account may credit test purchases and developer gifts. */
  allowTest: boolean;
}

/**
 * The entitlement as something to credit, or null to leave it alone: not this
 * app or user, already consumed or deleted, not a gem-pack SKU, or a free
 * test entitlement on an account that is not allow-listed.
 */
export function creditableEntitlement(raw: unknown, ctx: EntitlementContext): CreditableEntitlement | null {
  if (typeof raw !== "object" || raw === null) return null;
  const e = raw as Record<string, unknown>;
  if (!isSnowflake(e.id) || e.application_id !== ctx.applicationId || e.user_id !== ctx.discordUserId) return null;
  // Consumables always carry `consumed`; require an explicit false.
  if (e.consumed !== false || e.deleted === true) return null;
  if (typeof e.type !== "number") return null;
  const paid = PAID_TYPES.has(e.type);
  if (!paid && !(ctx.allowTest && TEST_TYPES.has(e.type))) return null;
  const pack = packForSku(ctx.skus, e.sku_id);
  if (!pack) return null;
  return { id: e.id, skuId: e.sku_id as string, pack, type: e.type };
}

/** Discord answered with an error, timed out, or was unreachable. */
export class DiscordApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null
  ) {
    super(message);
    this.name = "DiscordApiError";
  }
}

type FetchLike = typeof fetch;

function botHeaders(env: DiscordGemsEnv): HeadersInit {
  return { Authorization: `Bot ${env.botToken}`, Accept: "application/json" };
}

/**
 * The user's entitlements for this app (raw, unvalidated), excluding ended
 * ones. Pages forward with `after` up to MAX_ENTITLEMENT_PAGES. Throws
 * DiscordApiError when Discord does not answer with a list.
 */
export async function listEntitlements(
  env: DiscordGemsEnv,
  discordUserId: string,
  fetchImpl: FetchLike = fetch
): Promise<unknown[]> {
  const all: unknown[] = [];
  let after: bigint | null = null;
  for (let page = 0; page < MAX_ENTITLEMENT_PAGES; page++) {
    const url = new URL(`${DISCORD_API_V10}/applications/${env.applicationId}/entitlements`);
    url.searchParams.set("user_id", discordUserId);
    url.searchParams.set("exclude_ended", "true");
    url.searchParams.set("exclude_deleted", "true");
    url.searchParams.set("limit", String(ENTITLEMENT_PAGE_LIMIT));
    if (after !== null) url.searchParams.set("after", after.toString());
    let res: Response;
    try {
      res = await fetchImpl(url, {
        headers: botHeaders(env),
        redirect: "error",
        signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
      });
    } catch {
      throw new DiscordApiError("Discord entitlements unreachable", null);
    }
    if (!res.ok) throw new DiscordApiError("Discord refused the entitlements list", res.status);
    const body: unknown = await res.json().catch(() => null);
    if (!Array.isArray(body)) throw new DiscordApiError("Discord entitlements were not a list", res.status);
    all.push(...body);
    if (body.length < ENTITLEMENT_PAGE_LIMIT) break;
    // Next page: everything after the newest id seen so far.
    for (const e of body) {
      const id = typeof e === "object" && e !== null ? (e as { id?: unknown }).id : undefined;
      if (isSnowflake(id) && (after === null || BigInt(id) > after)) after = BigInt(id);
    }
    if (after === null) break;
  }
  return all;
}

/** Mark a consumable entitlement used. True when Discord accepted it. Never throws. */
export async function consumeEntitlement(
  env: DiscordGemsEnv,
  entitlementId: string,
  fetchImpl: FetchLike = fetch
): Promise<boolean> {
  try {
    const res = await fetchImpl(
      `${DISCORD_API_V10}/applications/${env.applicationId}/entitlements/${entitlementId}/consume`,
      {
        method: "POST",
        headers: botHeaders(env),
        redirect: "error",
        signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

export interface DiscordSettlement {
  /** The player's gems after settling. */
  balance: number;
  /** Entitlements credited by this call. */
  credited: number;
  /** Entitlements an earlier call had already credited (their consume is retried). */
  duplicates: number;
  /** Entitlements credited (now or before) whose consume failed; they come back next time. */
  unconsumed: number;
}

/**
 * Credit and consume every creditable entitlement of the signed-in Discord
 * user. Throws DiscordApiError when the list cannot be read, and lets a
 * database error from creditGemPack through (nothing is consumed after it).
 */
export async function settleDiscordGems(
  uid: string,
  discordUserId: string,
  env: DiscordGemsEnv,
  fetchImpl: FetchLike = fetch
): Promise<DiscordSettlement> {
  const ctx: EntitlementContext = {
    applicationId: env.applicationId,
    discordUserId,
    skus: env.skus,
    allowTest: env.testUids.has(uid),
  };
  const raw = await listEntitlements(env, discordUserId, fetchImpl);
  const seen = new Set<string>();
  const result: DiscordSettlement = { balance: 0, credited: 0, duplicates: 0, unconsumed: 0 };
  let balance: number | null = null;

  for (const entry of raw) {
    const ent = creditableEntitlement(entry, ctx);
    if (!ent || seen.has(ent.id)) continue;
    seen.add(ent.id);
    const credit = await creditGemPack({ userId: uid, provider: "discord", externalId: ent.id, pack: ent.pack });
    balance = credit.balance;
    if (credit.outcome === "credited") result.credited++;
    else result.duplicates++;
    const consumed = await consumeEntitlement(env, ent.id, fetchImpl);
    if (!consumed) result.unconsumed++;
    console.log(
      JSON.stringify({
        type: "discord_gem_pack",
        uid,
        entitlement_id: ent.id,
        entitlement_type: ent.type,
        sku_id: ent.skuId,
        pack_id: ent.pack.id,
        outcome: credit.outcome,
        consumed,
        timestamp: new Date().toISOString(),
      })
    );
  }
  result.balance = balance ?? (await gemBalance(uid));
  return result;
}
