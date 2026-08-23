/**
 * POST /api/admin/hide
 *
 * Set hidden_at on a block, removing it from the tower read path.
 * Requires: Authorization: Bearer {ADMIN_SECRET}
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../src/api/middleware/requireAdmin";
import { hideBlock, getBlockById } from "../../../../src/db/blocks";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Auth check first
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { block_id } = body;

    if (!block_id || typeof block_id !== "string") {
      return NextResponse.json(
        { error: "block_id is required" },
        { status: 400 }
      );
    }

    // Check block exists
    const existing = await getBlockById(block_id);
    if (!existing) {
      return NextResponse.json({ error: "Block not found" }, { status: 404 });
    }

    const block = await hideBlock(block_id);

    console.log(
      JSON.stringify({
        type: "admin_action",
        action: "hide",
        block_id,
        hidden_at: block.hidden_at?.toISOString(),
        timestamp: new Date().toISOString(),
      })
    );

    return NextResponse.json({
      hidden_at: block.hidden_at?.toISOString(),
    });
  } catch (error) {
    console.error("[POST /api/admin/hide]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
