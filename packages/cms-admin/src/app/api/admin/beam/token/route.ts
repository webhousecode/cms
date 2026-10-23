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
import { requireInstanceAdmin } from "@/lib/instance-admin";
import { getServerTSafe } from "@/i18n/server";

export async function POST(request: NextRequest) {
  const t = await getServerTSafe();
  // Security W41 NY-K2 — a beam token lets its holder create a site on THIS
  // instance (any org): an instance-level grant, not a site admin's.
  const denied = await requireInstanceAdmin(); if (denied) return denied;

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
    const message = err instanceof Error ? err.message : t("errAdmin.beam.tokenFailed");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const t = await getServerTSafe();
  // Security W41 NY-K2 — a beam token lets its holder create a site on THIS
  // instance (any org): an instance-level grant, not a site admin's.
  const denied = await requireInstanceAdmin(); if (denied) return denied;

  try {
    const tokens = await listActiveBeamTokens();
    // Mask tokens for display (show first 10 + last 4 chars)
    const masked = tokens.map((t) => ({
      ...t,
      token: t.token.slice(0, 10) + "..." + t.token.slice(-4),
    }));
    return NextResponse.json({ tokens: masked });
  } catch (err) {
    const message = err instanceof Error ? err.message : t("errAdmin.beam.listTokensFailed");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
