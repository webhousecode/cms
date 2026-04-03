/**
 * Beam Token Management API.
 *
 * POST /api/admin/beam/token — Generate a new beam token
 * GET  /api/admin/beam/token — List active tokens
 *
 * Auth: admin only (middleware-protected).
 */
import { NextRequest, NextResponse } from "next/server";
import { generateBeamToken, listActiveBeamTokens } from "@/lib/beam/tokens";
import { getSiteRole } from "@/lib/require-role";

export async function POST(request: NextRequest) {
  const role = await getSiteRole();
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const label = (body as { label?: string }).label;
    const token = await generateBeamToken(label);

    return NextResponse.json({
      success: true,
      token: token.token,
      expiresAt: token.expiresAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const role = await getSiteRole();
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  try {
    const tokens = await listActiveBeamTokens();
    // Mask tokens for display (show first 10 + last 4 chars)
    const masked = tokens.map((t) => ({
      ...t,
      token: t.token.slice(0, 10) + "..." + t.token.slice(-4),
    }));
    return NextResponse.json({ tokens: masked });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list tokens";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
