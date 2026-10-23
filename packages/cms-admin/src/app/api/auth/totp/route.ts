import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, getUserById } from "@/lib/auth";
import { disableTotp } from "@/lib/totp";
import { getServerTSafe } from "@/i18n/server";

/** GET /api/auth/totp — current TOTP status for the signed-in user */
export async function GET() {
  const t = await getServerTSafe();
  const session = await getSessionUser(await cookies());
  if (!session) return NextResponse.json({ error: t("errApi.common.unauthorized") }, { status: 401 });
  const user = await getUserById(session.id);
  if (!user) return NextResponse.json({ error: t("errApi.common.notFound") }, { status: 404 });
  return NextResponse.json({
    enabled: !!user.totp,
    createdAt: user.totp?.createdAt,
    lastUsedAt: user.totp?.lastUsedAt,
    backupCodesRemaining: user.totp?.backupCodeHashes.length ?? 0,
  });
}

/** DELETE /api/auth/totp — disable TOTP. Requires a current code in body. */
export async function DELETE(req: NextRequest) {
  const t = await getServerTSafe();
  const session = await getSessionUser(await cookies());
  if (!session) return NextResponse.json({ error: t("errApi.common.unauthorized") }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { code?: string };
  if (!body.code) return NextResponse.json({ error: t("errApi.common.missingCode") }, { status: 400 });
  try {
    await disableTotp(session.id, body.code);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : t("errApi.common.failed") }, { status: 400 });
  }
}
