/**
 * GET/PUT /api/social/brand-profile (§4.3, Epic C). Only `name` is
 * required (AC-12); PUT returns the same shape as GET for immediate
 * GET-after-PUT consistency (AC-11).
 */

import { NextRequest } from "next/server";
import { withSocialAdmin, jsonOk, jsonError, enforceRateLimit } from "../../../../src/api/social/routeHelpers";
import { getBrandProfile, saveBrandProfile } from "../../../../src/db/social/brandProfile";
import { writeAuditLog } from "../../../../src/db/social/auditLog";

export const runtime = "nodejs";

export const GET = withSocialAdmin(async (request: NextRequest, decoded) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:brand-profile:get",
    identifier: decoded.uid,
    max: 60,
    windowSeconds: 60,
    failMode: "open",
  });
  if (limited) return limited;

  const profile = await getBrandProfile();
  return jsonOk(profile);
});

interface BrandProfileBody {
  name?: unknown;
  niche?: unknown;
  audience?: unknown;
  tone?: unknown;
  style?: unknown;
  topicsToDiscuss?: unknown;
  topicsToAvoid?: unknown;
  ctas?: unknown;
  terminology?: unknown;
  competitors?: unknown;
  products?: unknown;
  positioning?: unknown;
}

function stringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

export const PUT = withSocialAdmin(async (request: NextRequest, decoded) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:brand-profile:put",
    identifier: decoded.uid,
    max: 20,
    windowSeconds: 60,
    failMode: "closed",
  });
  if (limited) return limited;

  let body: BrandProfileBody;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400, "VALIDATION_ERROR");
  }

  if (typeof body.name !== "string" || !body.name.trim()) {
    return jsonError("name is required", 400, "VALIDATION_ERROR");
  }

  const profile = await saveBrandProfile({
    name: body.name.trim(),
    niche: typeof body.niche === "string" ? body.niche : null,
    audience: typeof body.audience === "string" ? body.audience : null,
    tone: typeof body.tone === "string" ? body.tone : null,
    style: typeof body.style === "string" ? body.style : null,
    topicsToDiscuss: stringArray(body.topicsToDiscuss),
    topicsToAvoid: stringArray(body.topicsToAvoid),
    ctas: stringArray(body.ctas),
    terminology: stringArray(body.terminology),
    competitors: stringArray(body.competitors),
    products: stringArray(body.products),
    positioning: typeof body.positioning === "string" ? body.positioning : null,
    updatedByUid: decoded.uid,
  });

  await writeAuditLog({ action: "BRAND_PROFILE_UPDATE", result: "SUCCESS", initiator: decoded.uid });
  return jsonOk(profile);
});
