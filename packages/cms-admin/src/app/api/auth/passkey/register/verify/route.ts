import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { confirmRegistration, getRpFromRequest } from "@/lib/webauthn";
import { getServerTSafe } from "@/i18n/server";

export async function POST(req: NextRequest) {
  const t = await getServerTSafe();
  const session = await getSessionUser(await cookies());
  if (!session) return NextResponse.json({ error: t("errApi.common.unauthorized") }, { status: 401 });
  const body = (await req.json()) as { response: unknown; name?: string };
  if (!body?.response) return NextResponse.json({ error: t("errApi.common.missingResponse") }, { status: 400 });
  const rp = getRpFromRequest(req);
  try {
    const passkey = await confirmRegistration(
      session.id,
      body.response as Parameters<typeof confirmRegistration>[1],
      rp,
      body.name || t("errApi.authPasskey.defaultName"),
    );
    return NextResponse.json({
      ok: true,
      passkey: { id: passkey.id, name: passkey.name, createdAt: passkey.createdAt, deviceType: passkey.deviceType, backedUp: passkey.backedUp },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : t("errApi.authPasskey.registrationFailed") }, { status: 400 });
  }
}
