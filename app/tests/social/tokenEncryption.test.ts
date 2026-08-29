import { describe, it, expect, beforeAll } from "vitest";
import { encryptToken, decryptToken } from "../../src/social/crypto/tokenEncryption";

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
});

describe("tokenEncryption", () => {
  it("round-trips a token through encrypt/decrypt", () => {
    const plain = "ya29.access-token-example";
    const encrypted = encryptToken(plain);
    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain(plain);
    expect(decryptToken(encrypted)).toBe(plain);
  });

  it("produces different ciphertext for the same plaintext (random IV)", () => {
    const a = encryptToken("same-token");
    const b = encryptToken("same-token");
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe("same-token");
    expect(decryptToken(b)).toBe("same-token");
  });
});
