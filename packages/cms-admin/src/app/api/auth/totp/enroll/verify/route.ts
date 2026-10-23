import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { verifyEnrollment } from "@/lib/totp";
import { getServerTSafe } from "@/i18n/server";

export async function POST(req: NextRequest) {
  const t = await getServerTSafe();
  const session = await getSessionUser(await cookies());
  if (!session) return NextResponse.json({ error: t("errApi.common.unauthorized") }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { code?: string };
  if (!body.code) return NextResponse.json({ error: t("errApi.common.missingCode") }, { status: 400 });
  try {
    const { backupCodes } = await verifyEnrollment(session.id, body.code);
    return NextResponse.json({ ok: true, backupCodes });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : t("errApi.authTotp.verificationFailed") }, { status: 400 });
  }
}
