import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { confirmRegistration, getRpFromRequest } from "@/lib/webauthn";

export async function POST(req: NextRequest) {
  const session = await getSessionUser(await cookies());
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json()) as { response: unknown; name?: string };
  if (!body?.response) return NextResponse.json({ error: "Missing response" }, { status: 400 });
  const rp = getRpFromRequest(req);
  try {
    const passkey = await confirmRegistration(
      session.id,
      body.response as Parameters<typeof confirmRegistration>[1],
      rp,
      body.name || "Passkey",
    );
    return NextResponse.json({
      ok: true,
      passkey: { id: passkey.id, name: passkey.name, createdAt: passkey.createdAt, deviceType: passkey.deviceType, backedUp: passkey.backedUp },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Registration failed" }, { status: 400 });
  }
}
