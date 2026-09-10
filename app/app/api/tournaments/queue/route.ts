import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    { error: "Tournaments are coming soon", code: "COMING_SOON" },
    { status: 503 }
  );
}

export async function POST() {
  return NextResponse.json(
    { error: "Tournaments are coming soon", code: "COMING_SOON" },
    { status: 503 }
  );
}
