import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, getUserById } from "@/lib/auth";

/** GET /api/auth/passkey — list current user's passkeys (sans public key bytes). */
export async function GET(_req: NextRequest) {
  const session = await getSessionUser(await cookies());
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await getUserById(session.id);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
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
