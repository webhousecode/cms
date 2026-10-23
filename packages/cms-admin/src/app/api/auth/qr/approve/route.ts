import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { approveQrSession, rejectQrSession } from "@/lib/qr-sessions";
import { getServerTSafe } from "@/i18n/server";

/**
 * POST /api/auth/qr/approve
 *
 * Called by an already-authenticated client (mobile app or another browser
 * tab where the user is logged in) to approve a pending QR session for the
 * desktop. The current session's userId becomes the userId of the approved
 * QR session.
 */
export async function POST(req: NextRequest) {
  const t = await getServerTSafe();
  const session = await getSessionUser(await cookies());
  if (!session) return NextResponse.json({ error: t("errApi.common.unauthorized") }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { sessionId?: string; reject?: boolean };
  if (!body.sessionId) return NextResponse.json({ error: t("errApi.authQr.missingSessionId") }, { status: 400 });

  try {
    const updated = body.reject
      ? rejectQrSession(body.sessionId, t)
      : approveQrSession(body.sessionId, session.id, t);
    return NextResponse.json({ ok: true, status: updated.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : t("errApi.authQr.approvalFailed") },
      { status: 400 },
    );
  }
}
