import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { removePasskey } from "@/lib/webauthn";
import { getServerTSafe } from "@/i18n/server";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t = await getServerTSafe();
  const session = await getSessionUser(await cookies());
  if (!session) return NextResponse.json({ error: t("errApi.common.unauthorized") }, { status: 401 });
  const { id } = await params;
  try {
    await removePasskey(session.id, decodeURIComponent(id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : t("errApi.authPasskey.removeFailed") }, { status: 400 });
  }
}
