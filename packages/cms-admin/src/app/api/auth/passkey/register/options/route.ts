import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, getUserById } from "@/lib/auth";
import { buildRegistrationOptions, getRpFromRequest } from "@/lib/webauthn";
import { getServerTSafe } from "@/i18n/server";

export async function POST(req: NextRequest) {
  const t = await getServerTSafe();
  const session = await getSessionUser(await cookies());
  if (!session) return NextResponse.json({ error: t("errApi.common.unauthorized") }, { status: 401 });
  const user = await getUserById(session.id);
  if (!user) return NextResponse.json({ error: t("errApi.common.notFound") }, { status: 404 });
  const rp = getRpFromRequest(req);
  const options = await buildRegistrationOptions(user, rp);
  return NextResponse.json(options);
}
