import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../../src/lib/requireAuth";
import { checkRateLimit } from "../../../../src/lib/rateLimit";
import { registerPushToken, unregisterPushToken } from "../../../../src/db/pushToken";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { uid } = await requireAuth(request);
    const rl = await checkRateLimit({
      namespace: "push:register",
      identifier: uid,
      max: 20,
      windowSeconds: 60,
      failMode: "open",
    });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = (await request.json()) as {
      token?: unknown;
      platform?: unknown;
    };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const platform = typeof body.platform === "string" ? body.platform : "";

    if (!token) {
      return NextResponse.json(
        { error: "token is required", code: "MISSING_FIELD" },
        { status: 400 }
      );
    }
    if (platform !== "ios" && platform !== "android") {
      return NextResponse.json(
        { error: "platform must be ios or android", code: "INVALID_FIELD" },
        { status: 400 }
      );
    }

    await registerPushToken(uid, token, platform);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[POST /api/push/register]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { uid: _uid } = await requireAuth(request);

    const body = (await request.json()) as { token?: unknown };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) {
      return NextResponse.json(
        { error: "token is required", code: "MISSING_FIELD" },
        { status: 400 }
      );
    }

    await unregisterPushToken(token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[DELETE /api/push/register]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
