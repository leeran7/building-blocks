/**
 * Shop gems: the balance, gem-pack settlement, and spending gems on
 * characters and skins (and, from the lives flow, on lives).
 *
 * users.gems is SERVER-DERIVED. It rises only through creditGemPack, after a
 * payment provider has confirmed the money (the Stripe webhook, or an App
 * Store transaction whose signature chains to Apple's root), and falls only
 * through spendGems. Both hold the user row lock (SELECT ... FOR UPDATE) and
 * write one append-only gem_ledger row with balance_after, keyed by a unique
 * idempotency key, so a retried request or a replayed webhook applies once
 * and concurrent spends can never overspend. A CHECK keeps gems >= 0.
 *
 * What a purchase costs and what a pack credits come from the catalogues
 * (src/lib/avatars.ts, src/lib/gemPacks.ts), never from the request.
 */

import { GemLedgerKind, type Prisma } from "@prisma/client";
import { prisma } from "./client";
import { avatarEntry, parseAvatarId } from "../lib/avatars";
import { purchaseRefusal, type PurchaseRefusal } from "../lib/avatarUnlocks";
import type { GemPack } from "../lib/gemPacks";
import { levelStarsEarned, ownedCharacterIds, tutorialCleared } from "./avatarUnlocks";

type Tx = Prisma.TransactionClient;

/** Which payment path settled a pack. */
export type GemProvider = "stripe" | "apple";

export type GemErrorCode = PurchaseRefusal | "INSUFFICIENT_GEMS" | "UNKNOWN_ITEM" | "NO_USER";

/** A refused spend or purchase. `balance` is the player's gems when refused. */
export class GemError extends Error {
  constructor(
    public readonly code: GemErrorCode,
    message: string,
    public readonly balance: number | null = null
  ) {
    super(message);
    this.name = "GemError";
  }
}

/** Lock the user row for this transaction and read its gems. */
async function lockGems(tx: Tx, userId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ gems: number }[]>`SELECT gems FROM users WHERE id = ${userId} FOR UPDATE`;
  if (rows.length === 0) throw new GemError("NO_USER", "No account for this user");
  return rows[0].gems;
}

/** The player's gems; 0 for a user with no row yet. */
export async function gemBalance(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { gems: true } });
  return user?.gems ?? 0;
}

export interface SpendGemsInput {
  userId: string;
  /** Gems to take, a positive whole number. */
  amount: number;
  /** What for: "character", "lives", ... (gem_ledger.reason). */
  reason: string;
  /** The thing bought, e.g. an avatar id. */
  ref?: string | null;
  /**
   * Unique per logical spend (e.g. "lives:<userId>:<ticket>"). A repeat with
   * the same key is a no-op that reports `duplicate`.
   */
  idempotencyKey: string;
}

export type SpendGemsResult = { outcome: "spent" | "duplicate"; balance: number };

/**
 * Take `amount` gems inside the caller's transaction, so the spend and what it
 * buys commit together. Locks the user row. Throws GemError INSUFFICIENT_GEMS
 * (and writes nothing) when the balance is short.
 */
export async function spendGems(tx: Tx, input: SpendGemsInput): Promise<SpendGemsResult> {
  const { userId, amount, reason, idempotencyKey } = input;
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("spendGems: amount must be a positive integer");
  const balance = await lockGems(tx, userId);

  const seen = await tx.gemLedger.findUnique({ where: { idempotency_key: idempotencyKey }, select: { id: true } });
  if (seen) return { outcome: "duplicate", balance };

  if (balance < amount) {
    throw new GemError("INSUFFICIENT_GEMS", `You need ${amount - balance} more gems`, balance);
  }
  const updated = await tx.user.update({
    where: { id: userId },
    data: { gems: { decrement: amount } },
    select: { gems: true },
  });
  await tx.gemLedger.create({
    data: {
      user_id: userId,
      amount: -amount,
      balance_after: updated.gems,
      kind: GemLedgerKind.SPEND,
      reason,
      ref: input.ref ?? null,
      idempotency_key: idempotencyKey,
    },
  });
  return { outcome: "spent", balance: updated.gems };
}

export interface CreditGemPackInput {
  userId: string;
  provider: GemProvider;
  /** The Stripe Checkout session id or the App Store transaction id. */
  externalId: string;
  pack: GemPack;
}

export type CreditGemPackResult = { outcome: "credited" | "duplicate"; balance: number };

/**
 * Credit a paid gem pack once per (provider, externalId). The caller has
 * already confirmed the payment with the provider.
 */
export async function creditGemPack(input: CreditGemPackInput): Promise<CreditGemPackResult> {
  const { userId, provider, externalId, pack } = input;
  if (!externalId) throw new Error("creditGemPack: externalId is required");
  return prisma.$transaction(async (tx) => {
    const balance = await lockGems(tx, userId);
    const existing = await tx.gemPurchase.findUnique({
      where: { gem_purchase_provider_external: { provider, external_id: externalId } },
      select: { id: true },
    });
    if (existing) return { outcome: "duplicate", balance } satisfies CreditGemPackResult;

    await tx.gemPurchase.create({
      data: { user_id: userId, provider, external_id: externalId, pack_id: pack.id, gems: pack.gems },
    });
    const updated = await tx.user.update({
      where: { id: userId },
      data: { gems: { increment: pack.gems } },
      select: { gems: true },
    });
    await tx.gemLedger.create({
      data: {
        user_id: userId,
        amount: pack.gems,
        balance_after: updated.gems,
        kind: GemLedgerKind.PURCHASE,
        reason: "gem_pack",
        ref: pack.id,
        idempotency_key: `${provider}:${externalId}`,
      },
    });
    return { outcome: "credited", balance: updated.gems } satisfies CreditGemPackResult;
  });
}

export interface ShopState {
  gems: number;
  ownedIds: string[];
}

/** The player's gems and what they have bought. */
export async function shopState(userId: string): Promise<ShopState> {
  const [gems, ownedIds] = await Promise.all([gemBalance(userId), ownedCharacterIds(userId)]);
  return { gems, ownedIds };
}

const REFUSAL_MESSAGES: Record<PurchaseRefusal, string> = {
  NOT_FOR_SALE: "That character isn't sold in the Shop",
  OWNED: "You already own that",
  CHARACTER_REQUIRED: "Unlock the character first to buy this skin",
};

/**
 * Buy a character or skin with gems. Everything it decides on is read inside
 * one transaction under the user lock: the price (catalogue), what the player
 * owns, and whether a skin's character is selectable. Throws GemError.
 */
export async function buyCharacter(userId: string, avatarId: string): Promise<ShopState> {
  const entry = avatarEntry(avatarId);
  if (entry === null) throw new GemError("UNKNOWN_ITEM", "That isn't in the Shop");
  return prisma.$transaction(async (tx) => {
    await lockGems(tx, userId);
    const [user, ownedIds, stars, tutorialDone] = await Promise.all([
      tx.user.findUnique({ where: { id: userId }, select: { avatar_id: true } }),
      ownedCharacterIds(userId, tx),
      levelStarsEarned(userId, tx),
      tutorialCleared(userId, tx),
    ]);
    const refusal = purchaseRefusal(entry, {
      stars,
      tutorialDone,
      savedAvatarId: parseAvatarId(user?.avatar_id),
      ownedIds,
    });
    if (refusal !== null) throw new GemError(refusal, REFUSAL_MESSAGES[refusal]);
    if (entry.unlock.kind !== "purchase") throw new GemError("NOT_FOR_SALE", REFUSAL_MESSAGES.NOT_FOR_SALE);

    const price = entry.unlock.gems;
    const spent = await spendGems(tx, {
      userId,
      amount: price,
      reason: "character",
      ref: entry.id,
      idempotencyKey: `character:${userId}:${entry.id}`,
    });
    await tx.ownedCharacter.create({ data: { user_id: userId, avatar_id: entry.id, gems_paid: price } });
    return { gems: spent.balance, ownedIds: [...ownedIds, entry.id] };
  });
}
