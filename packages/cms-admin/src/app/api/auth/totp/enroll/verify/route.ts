import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { verifyEnrollment } from "@/lib/totp";

export async function POST(req: NextRequest) {
  const session = await getSessionUser(await cookies());
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { code?: string };
  if (!body.code) return NextResponse.json({ error: "Missing code" }, { status: 400 });
  try {
    const { backupCodes } = await verifyEnrollment(session.id, body.code);
    return NextResponse.json({ ok: true, backupCodes });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Verification failed" }, { status: 400 });
  }
}
