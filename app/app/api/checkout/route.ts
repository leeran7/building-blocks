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
import { uniqueSlug } from "../../../src/lib/slugify";
import { getStripe } from "../../../src/api/stripe";
import { resolveBaseUrl } from "../../../src/config/public";

export const runtime = "nodejs";

/** Normalize a category to a well-formed slug; default to "tech". */
function normalizeCategorySlug(raw: string | undefined): string {
  const slug = (raw ?? "tech").toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(slug) ? slug : "tech";
}

// Strip control characters and Unicode bidi-override chars to prevent log injection
// and link-spoofing attacks (CWE-117).
function sanitizeDisplayName(raw: string): string {
  // biome-ignore lint: intentional control-char strip
  return raw.replace(/[\x00-\x1F\x7F]/g, "").normalize("NFC").trim();
}

const NewListingSchema = z.object({
  type: z.literal("new"),
  url: z.string().min(1),
  display_name: z.string().min(1).max(100).transform(sanitizeDisplayName),
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
    const body = await request.json();

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

    // Validate amount minimums
    const minAmount =
      data.type === "new" ? constants.MIN_ENTRY_USD : constants.MIN_SPEND_USD;
    if (data.amount_usd < minAmount) {
      return NextResponse.json(
        { error: `Minimum amount is $${minAmount}` },
        { status: 400 }
      );
    }

    // Resolve category slug for new listings (default "tech").
    const category: string =
      data.type === "new" ? normalizeCategorySlug(data.category) : "tech";

    // Get active season for this category
    const season = await getOrCreateActiveSeason(category);
    if (!season.is_active) {
      return NextResponse.json({ error: "No active season" }, { status: 503 });
    }

    const V = season.views_k;
    // Server always computes rate — never trusts client
    const rate = computeRate(V);

    let blockId: string;
    let displayName: string;

    if (data.type === "new") {
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
        category,
      });

      blockId = block.id;
      displayName = data.display_name;

      // Remember this URL on the user so they can reuse it next time.
      if (authenticatedUserId) {
        await addSavedUrl(authenticatedUserId, urlResult.sanitised).catch(() => {
          /* best-effort — never block checkout on this */
        });
      }
    } else {
      // Top-up: validate block exists
      const block = await getBlockById(data.block_id);
      if (!block) {
        return NextResponse.json({ error: "Block not found" }, { status: 404 });
      }
      blockId = block.id;
      displayName = block.display_name;
    }

    // Create Stripe Checkout session
    const stripe = getStripe();
    const baseUrl = resolveBaseUrl();

    // Find block slug for redirect
    const block = await getBlockById(blockId);
    const slug = block?.slug ?? blockId;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(data.amount_usd * 100),
            product_data: {
              name: `Stack — ${displayName}`,
              description: `Current rate: $1 = ${rate.toFixed(2)}m altitude. Positions are live; your rank is calculated when payment completes.`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        block_id: blockId,
        season_id: season.id,
        category: category,
        // Server-computed rate stored for audit trail only
        // (webhook recomputes metres from live views_k at settlement time)
        rate_at_checkout: rate.toString(),
      },
      // No-refunds disclosure (AC-35)
      custom_text: {
        submit: {
          message:
            "Altitude is permanent. No refunds. Positions are live; your rank is calculated when payment completes.",
        },
      },
      success_url: `${baseUrl}/b/${slug}?payment=success`,
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
