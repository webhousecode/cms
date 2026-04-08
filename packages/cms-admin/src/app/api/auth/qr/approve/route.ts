import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { approveQrSession, rejectQrSession } from "@/lib/qr-sessions";

/**
 * POST /api/auth/qr/approve
 *
 * Called by an already-authenticated client (mobile app or another browser
 * tab where the user is logged in) to approve a pending QR session for the
 * desktop. The current session's userId becomes the userId of the approved
 * QR session.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser(await cookies());
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { sessionId?: string; reject?: boolean };
  if (!body.sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });

  try {
    const updated = body.reject
      ? rejectQrSession(body.sessionId)
      : approveQrSession(body.sessionId, session.id);
    return NextResponse.json({ ok: true, status: updated.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Approval failed" },
      { status: 400 },
    );
  }
}
