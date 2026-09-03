/**
 * POST /api/admin/hide-unpaid
 *
 * One-shot cleanup: hide all blocks with altitude=0 and no payment row.
 * These are abandoned/failed checkout sessions created before the
 * hidden_at-on-create fix shipped.
 *
 * Requires: Authorization: Bearer {ADMIN_TOKEN}
 * Returns: { hidden: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../src/api/middleware/requireAdmin";
import { prisma } from "../../../../src/db/client";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const now = new Date();

    // Find blocks with no altitude and no confirmed payment
    const unpaid = await prisma.block.findMany({
      where: {
        altitude: 0,
        hidden_at: null,
        payments: { none: {} },
      },
      select: { id: true },
    });

    if (unpaid.length === 0) {
      return NextResponse.json({ hidden: 0 });
    }

    const ids = unpaid.map((b) => b.id);
    await prisma.block.updateMany({
      where: { id: { in: ids } },
      data: { hidden_at: now },
    });

    console.log(
      JSON.stringify({
        type: "admin_action",
        action: "hide-unpaid",
        count: ids.length,
        block_ids: ids,
        timestamp: now.toISOString(),
      })
    );

    return NextResponse.json({ hidden: ids.length });
  } catch (error) {
    console.error("[POST /api/admin/hide-unpaid]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
