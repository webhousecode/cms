import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { startEnrollment } from "@/lib/totp";
import { getServerTSafe } from "@/i18n/server";

export async function POST() {
  const t = await getServerTSafe();
  const session = await getSessionUser(await cookies());
  if (!session) return NextResponse.json({ error: t("errApi.common.unauthorized") }, { status: 401 });
  try {
    const result = await startEnrollment(session.id);
    return NextResponse.json({
      otpauthUri: result.otpauthUri,
      qrDataUrl: result.qrDataUrl,
      // Manual entry fallback if user can't scan the QR
      secret: result.secret,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : t("errApi.common.failed") }, { status: 400 });
  }
}
