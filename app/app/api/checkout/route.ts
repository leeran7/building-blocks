/**
 * POST /api/checkout
 *
 * Create a Stripe Checkout session for new listing or top-up.
 *
 * CRITICAL:
 * - New listings require auth (C1: prevent unauthenticated altitude manipulation)
 * - Server NEVER trusts client-supplied rate, metres, or growth (NFR-S2, AC-30)
 * - Reject requests containing rate, metres, or growth in body
 * - Server always recomputes quote from current engine state
 * - URL is validated and sanitised (NFR-S4)
 * - userId derived from verified Firebase token — never from client body (C2)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateActiveSeason } from "../../../src/db/seasons";
import { createBlock, getBlockById } from "../../../src/db/blocks";
import { ensureUser } from "../../../src/db/user";
import { addSavedUrl } from "../../../src/db/settings";
import { requireAuth, AuthError } from "../../../src/lib/requireAuth";
import { computeRate } from "../../../src/engine/index";
import { loadConstants } from "../../../src/engine/constants";
import { validateUrl } from "../../../src/lib/validateUrl";
import { sanitizeDisplayName } from "../../../src/lib/sanitizeName";
import { isHatefulName } from "../../../src/lib/nameModeration";
import { uniqueSlug } from "../../../src/lib/slugify";
import { getStripe } from "../../../src/api/stripe";
import { resolveBaseUrl } from "../../../src/config/public";
import { checkRateLimit, clientIp } from "../../../src/lib/rateLimit";
import { parsePaidStackSlug, parseSeasonSlug } from "../../../src/game/categories";
import { formatAltitude } from "../../../src/lib/units";

export const runtime = "nodejs";

// Generous per-caller cap — real buyers make a handful of sessions, abusers
// hammer. Fails OPEN if Redis is down so a Redis outage never blocks a sale.
const CHECKOUT_RATE_MAX = 30;
const CHECKOUT_RATE_WINDOW_SECONDS = 60;

/** A curated paid-stack slug, or null if the client sent a ghost/legacy value. */
function normalizeCategorySlug(raw: string | undefined): string | null {
  return parsePaidStackSlug(raw);
}

const NewListingSchema = z.object({
  type: z.literal("new"),
  url: z.string().min(1),
  // A block name is public (tower + record pages). Share the sanitiser used for
  // profile names (strips control / zero-width / bidi-spoof chars, CWE-117), then
  // require a non-empty result and reject racist / hateful names.
  display_name: z
    .string()
    .min(1)
    .max(100)
    .transform(sanitizeDisplayName)
    .refine((n) => n.length > 0, { message: "Display name is required" })
    .refine((n) => !isHatefulName(n), {
      message: "That display name isn’t allowed.",
    }),
  owner_email: z.string().email(),
  category: z.string().optional(),
  amount_usd: z.number().positive(),
});

const TopupSchema = z.object({
  type: z.literal("topup"),
  block_id: z.string().min(1),
  amount_usd: z.number().positive(),
});

const RequestSchema = z.union([NewListingSchema, TopupSchema]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // Body must be a JSON object. A primitive/array/null would make the `in`
    // checks below throw a TypeError and surface as a misleading 500.
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Request body must be a JSON object" },
        { status: 400 }
      );
    }

    // CRITICAL: Reject if client supplies rate, metres, or growth (AC-30, NFR-S2)
    if ("rate" in body || "metres" in body || "growth" in body) {
      return NextResponse.json(
        { error: "Client-supplied rate/metres/growth is forbidden" },
        { status: 400 }
      );
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const constants = loadConstants();

    // C1: New listings require authentication — top-ups remain open
    let authenticatedUserId: string | null = null;
    if (data.type === "new") {
      try {
        const decoded = await requireAuth(request);
        authenticatedUserId = decoded.uid;
        // blocks.userId FKs to users(id). Provision the row from the verified
        // token so a first-time buyer (who may not have hit /api/auth/sync yet)
        // doesn't fail block creation with a FK violation. Requires an email.
        if (decoded.email) {
          await ensureUser({
            id: decoded.uid,
            email: decoded.email,
            emailVerified: decoded.email_verified ?? false,
          });
        } else {
          // No email → can't own a block; don't attach an unprovisioned uid.
          authenticatedUserId = null;
        }
      } catch (err) {
        if (err instanceof AuthError) return err.response;
        return NextResponse.json(
          { error: "Authentication required for new listings", code: "UNAUTHORIZED" },
          { status: 401 }
        );
      }
    }

    // Rate limit before any Stripe/DB writes. Key by verified UID when we have
    // one (new listings), otherwise by client IP (open top-ups). Fails OPEN so a
    // Redis outage never blocks a legitimate purchase (revenue path).
    const rlIdentifier = authenticatedUserId ?? `ip:${clientIp(request)}`;
    const rl = await checkRateLimit({
      namespace: "checkout",
      identifier: rlIdentifier,
      max: CHECKOUT_RATE_MAX,
      windowSeconds: CHECKOUT_RATE_WINDOW_SECONDS,
      failMode: "open",
    });
    if (!rl.allowed) {
      console.warn(
        JSON.stringify({
          type: "rate_limit_hit",
          path: "/api/checkout",
          identifier: rlIdentifier,
          timestamp: new Date().toISOString(),
        })
      );
      return NextResponse.json(
        { error: "Too many requests", code: "RATE_LIMITED" },
        { status: 429 }
      );
    }

    // Validate amount minimums
    const minAmount =
      data.type === "new" ? constants.MIN_ENTRY_USD : constants.MIN_SPEND_USD;
    if (data.amount_usd < minAmount) {
      return NextResponse.json(
        { error: `Minimum amount is $${minAmount}` },
        { status: 400 }
      );
    }

    // New listings must name a real 74-stack (never the legacy "tech" ghost).
    // Top-ups inherit the block's own category; a missing category is an error
    // rather than minting a ghost "tech" season.
    const isNewListing = data.type === "new";
    let stackSlug: string;
    let blockId = "";
    let displayName = "";
    let redirectSlug = "";

    if (isNewListing) {
      const stack = normalizeCategorySlug(data.category);
      if (!stack) {
        return NextResponse.json(
          { error: "Unknown stack", code: "INVALID_CATEGORY", field: "category" },
          { status: 400 }
        );
      }
      stackSlug = stack;
    } else {
      const block = await getBlockById(data.block_id);
      if (!block) {
        return NextResponse.json({ error: "Block not found" }, { status: 404 });
      }
      const stackSlugParsed = parseSeasonSlug(block.category);
      if (!stackSlugParsed) {
        return NextResponse.json(
          { error: "Block has no stack", code: "INVALID_CATEGORY" },
          { status: 400 }
        );
      }
      stackSlug = stackSlugParsed;
      blockId = block.id;
      displayName = block.display_name;
      redirectSlug = block.slug;
    }

    const season = await getOrCreateActiveSeason(stackSlug);
    if (!season.is_active) {
      return NextResponse.json({ error: "No active season" }, { status: 503 });
    }

    const V = season.views_k;
    // Server always computes rate — never trusts client
    const rate = computeRate(V);

    if (isNewListing) {
      // Validate and sanitise URL (NFR-S4)
      const urlResult = validateUrl(data.url);
      if (!urlResult.valid || !urlResult.sanitised) {
        return NextResponse.json({ error: urlResult.error }, { status: 400 });
      }

      // C2: userId comes from verified token, never from client body
      const slug = uniqueSlug(data.display_name);
      const block = await createBlock({
        slug,
        url: urlResult.sanitised,
        display_name: data.display_name,
        owner_email: data.owner_email,
        season_id: season.id,
        userId: authenticatedUserId ?? undefined,
        category: stackSlug,
        hidden_at: new Date(),
      });

      blockId = block.id;
      displayName = data.display_name;
      redirectSlug = block.slug;

      // Remember this URL on the user so they can reuse it next time.
      if (authenticatedUserId) {
        await addSavedUrl(authenticatedUserId, urlResult.sanitised).catch(() => {
          /* best-effort — never block checkout on this */
        });
      }
    }

    // Create Stripe Checkout session
    const stripe = getStripe();
    const baseUrl = resolveBaseUrl();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(data.amount_usd * 100),
            product_data: {
              name: `Stack — ${displayName}`,
              description: `Current rate: $1 = ${formatAltitude(rate, 2)} altitude. Positions are live; your rank is calculated when payment completes. Altitude is permanent. No refunds.`,
              tax_code: "txcd_10103001",
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        block_id: blockId,
        season_id: season.id,
        category: stackSlug,
        // Server-computed rate stored for audit trail only
        // (webhook recomputes metres from live views_k at settlement time)
        rate_at_checkout: rate.toString(),
      },
      success_url: `${baseUrl}/b/${redirectSlug}?payment=success`,
      cancel_url: `${baseUrl}/?payment=cancelled`,
    });

    return NextResponse.json({ checkout_url: session.url });
  } catch (error) {
    console.error("[POST /api/checkout]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
