import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, getUserById } from "@/lib/auth";
import { getServerTSafe } from "@/i18n/server";

/** GET /api/auth/passkey — list current user's passkeys (sans public key bytes). */
export async function GET(_req: NextRequest) {
  const t = await getServerTSafe();
  const session = await getSessionUser(await cookies());
  if (!session) return NextResponse.json({ error: t("errApi.common.unauthorized") }, { status: 401 });
  const user = await getUserById(session.id);
  if (!user) return NextResponse.json({ error: t("errApi.common.notFound") }, { status: 404 });
  const passkeys = (user.passkeys ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    lastUsedAt: p.lastUsedAt,
    deviceType: p.deviceType,
    backedUp: p.backedUp,
  }));
  return NextResponse.json({ passkeys });
}
