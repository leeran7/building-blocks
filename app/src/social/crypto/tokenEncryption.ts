/**
 * OAuth token encryption at rest (ADR-5).
 *
 * AES-256-GCM via Node's built-in `crypto` module — authenticated encryption
 * (tamper-evident, not just confidential), zero new dependency. Only
 * SocialAccount.accessTokenEncrypted / refreshTokenEncrypted are ever passed
 * through this module; everything else on that model is plaintext metadata.
 *
 * Format: "v1:<base64 iv (12 bytes)>:<base64 authTag (16 bytes)>:<base64 ciphertext>"
 *
 * Losing TOKEN_ENCRYPTION_KEY makes every connected account unrecoverable
 * (the admin must reconnect via OAuth) — an accepted risk at this scale
 * (≤ a handful of accounts), documented rather than solved with a KMS.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const FORMAT_VERSION = "v1";

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not configured — cannot encrypt/decrypt social OAuth tokens"
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}); generate with: openssl rand -base64 32`
    );
  }
  cachedKey = key;
  return key;
}

/** Encrypt a plaintext token for storage. Never logs or returns the plaintext. */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    FORMAT_VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/** Decrypt a stored token blob. Throws if the value is malformed or tampered with. */
export function decryptToken(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
    throw new Error("Malformed encrypted token — unexpected format/version");
  }
  const [, ivB64, authTagB64, ciphertextB64] = parts;
  const key = getKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

/** Generates a fresh base64-encoded 32-byte key — for the setup/onboarding runbook only. */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString("base64");
}
