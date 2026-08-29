import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isSocialAdmin } from "../../src/api/middleware/socialAdminAllowlist";

describe("isSocialAdmin (ADR-10)", () => {
  const origUids = process.env.ADMIN_UIDS;
  const origEmails = process.env.ADMIN_EMAILS;

  beforeEach(() => {
    process.env.ADMIN_UIDS = "uid-allowed";
    process.env.ADMIN_EMAILS = "admin@example.com";
  });

  afterEach(() => {
    process.env.ADMIN_UIDS = origUids;
    process.env.ADMIN_EMAILS = origEmails;
  });

  it("allows a UID on the allowlist", () => {
    expect(isSocialAdmin({ uid: "uid-allowed", email: "other@example.com" })).toBe(true);
  });

  it("allows an email on the allowlist", () => {
    expect(isSocialAdmin({ uid: "unknown", email: "admin@example.com" })).toBe(true);
  });

  it("denies users not on either list", () => {
    expect(isSocialAdmin({ uid: "stranger", email: "stranger@example.com" })).toBe(false);
  });

  it("fails closed when both lists are empty", () => {
    process.env.ADMIN_UIDS = "";
    process.env.ADMIN_EMAILS = "";
    expect(isSocialAdmin({ uid: "anyone", email: "any@example.com" })).toBe(false);
  });
});
