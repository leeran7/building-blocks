/**
 * SocialAccount data access (Epic B). Encrypts/decrypts tokens at the
 * boundary — callers above this module never see ciphertext or handle
 * encryption directly.
 */

import { prisma } from "../client";
import { encryptToken, decryptToken } from "../../social/crypto/tokenEncryption";
import type { SocialAccount } from "@prisma/client";
import type { SocialPlatform, SocialAccountStatus } from "../../social/types";
import type { OAuthTokenSet } from "../../social/providers/types";

export type SocialAccountPublic = Omit<
  SocialAccount,
  "accessTokenEncrypted" | "refreshTokenEncrypted"
>;

/** Strips encrypted token columns — the shape every API response must use (AC-8). */
export function toPublicAccount(account: SocialAccount): SocialAccountPublic {
  const { accessTokenEncrypted, refreshTokenEncrypted, ...rest } = account;
  void accessTokenEncrypted;
  void refreshTokenEncrypted;
  return rest;
}

export async function listSocialAccounts(): Promise<SocialAccountPublic[]> {
  const accounts = await prisma.socialAccount.findMany({
    where: { disconnectedAt: null },
    orderBy: { platform: "asc" },
  });
  return accounts.map(toPublicAccount);
}

export async function getSocialAccountById(id: string): Promise<SocialAccount | null> {
  return prisma.socialAccount.findUnique({ where: { id } });
}

/**
 * Upsert-by-platform-and-external-id (AC-6): the OAuth callback always calls
 * this rather than a blind create, so reconnecting the same external account
 * updates the existing row instead of creating a duplicate (the
 * `@@unique([platform, externalAccountId])` constraint would otherwise fail).
 */
export async function upsertSocialAccount(input: {
  platform: SocialPlatform;
  externalAccountId: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  tokens: OAuthTokenSet;
  connectedByUid: string;
}): Promise<SocialAccountPublic> {
  const account = await prisma.socialAccount.upsert({
    where: {
      social_account_platform_external_id: {
        platform: input.platform,
        externalAccountId: input.externalAccountId,
      },
    },
    create: {
      platform: input.platform,
      externalAccountId: input.externalAccountId,
      handle: input.handle,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      status: "CONNECTED",
      accessTokenEncrypted: encryptToken(input.tokens.accessToken),
      refreshTokenEncrypted: input.tokens.refreshToken ? encryptToken(input.tokens.refreshToken) : null,
      tokenExpiresAt: input.tokens.expiresAt,
      scopes: input.tokens.scopes,
      lastSyncedAt: new Date(),
      connectedByUid: input.connectedByUid,
    },
    update: {
      handle: input.handle,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      status: "CONNECTED",
      accessTokenEncrypted: encryptToken(input.tokens.accessToken),
      refreshTokenEncrypted: input.tokens.refreshToken ? encryptToken(input.tokens.refreshToken) : null,
      tokenExpiresAt: input.tokens.expiresAt,
      scopes: input.tokens.scopes,
      lastSyncedAt: new Date(),
      disconnectedAt: null,
      connectedByUid: input.connectedByUid,
    },
  });
  return toPublicAccount(account);
}

/** Decrypts and returns a usable token set for server-side provider calls only. */
export async function getDecryptedTokens(accountId: string): Promise<OAuthTokenSet | null> {
  const account = await prisma.socialAccount.findUnique({ where: { id: accountId } });
  if (!account?.accessTokenEncrypted) return null;
  return {
    accessToken: decryptToken(account.accessTokenEncrypted),
    refreshToken: account.refreshTokenEncrypted ? decryptToken(account.refreshTokenEncrypted) : null,
    expiresAt: account.tokenExpiresAt,
    scopes: account.scopes,
  };
}

export async function updateAccountTokens(accountId: string, tokens: OAuthTokenSet): Promise<void> {
  await prisma.socialAccount.update({
    where: { id: accountId },
    data: {
      accessTokenEncrypted: encryptToken(tokens.accessToken),
      refreshTokenEncrypted: tokens.refreshToken ? encryptToken(tokens.refreshToken) : undefined,
      tokenExpiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
      status: "CONNECTED",
      lastSyncedAt: new Date(),
    },
  });
}

export async function setAccountStatus(accountId: string, status: SocialAccountStatus): Promise<void> {
  await prisma.socialAccount.update({ where: { id: accountId }, data: { status } });
}

/**
 * Disconnect is idempotent (AC-10): clears token material within the same
 * request; a second call on an already-disconnected account is a no-op.
 */
export async function disconnectSocialAccount(accountId: string): Promise<SocialAccountPublic | null> {
  const existing = await prisma.socialAccount.findUnique({ where: { id: accountId } });
  if (!existing || existing.disconnectedAt) {
    return existing ? toPublicAccount(existing) : null;
  }
  const updated = await prisma.socialAccount.update({
    where: { id: accountId },
    data: {
      status: "DISCONNECTED",
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      disconnectedAt: new Date(),
    },
  });
  return toPublicAccount(updated);
}
