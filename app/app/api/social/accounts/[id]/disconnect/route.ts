/**
 * POST /api/social/accounts/:id/disconnect (§4.2). Idempotent — a second
 * call on an already-disconnected account is a no-op 200 (AC-10).
 */

import {
  withSocialAdminParams,
  jsonOk,
  jsonError,
  enforceRateLimit,
} from "../../../../../../src/api/social/routeHelpers";
import { disconnectSocialAccount, getSocialAccountById, getDecryptedTokens } from "../../../../../../src/db/social/socialAccounts";
import { getProvider } from "../../../../../../src/social/providers/registry";
import { writeAuditLog } from "../../../../../../src/db/social/auditLog";

export const runtime = "nodejs";

export const POST = withSocialAdminParams<{ id: string }>(async (request, decoded, params) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:accounts:disconnect",
    identifier: decoded.uid,
    max: 10,
    windowSeconds: 60,
    failMode: "closed",
  });
  if (limited) return limited;

  const existing = await getSocialAccountById(params.id);
  if (!existing) return jsonError("Account not found", 404, "NOT_FOUND");

  // Best-effort token revocation before clearing local state — never blocks
  // the disconnect itself if the platform call fails.
  if (!existing.disconnectedAt) {
    const tokens = await getDecryptedTokens(params.id);
    if (tokens) {
      try {
        await getProvider(existing.platform).revokeTokens(tokens);
      } catch (err) {
        console.warn(`[social-disconnect] revoke failed for ${existing.platform}/${params.id}`, err);
      }
    }
  }

  const updated = await disconnectSocialAccount(params.id);
  await writeAuditLog({
    action: "DISCONNECT_ACCOUNT",
    result: "SUCCESS",
    initiator: decoded.uid,
    platform: existing.platform,
    socialAccountId: params.id,
  });

  return jsonOk({ id: params.id, status: updated?.status ?? "DISCONNECTED" });
});
