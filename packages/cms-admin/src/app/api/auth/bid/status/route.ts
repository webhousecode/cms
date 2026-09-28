import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, getUserById } from "@/lib/auth";
import { isBidConfigured } from "@/lib/bid";

/**
 * GET /api/auth/bid/status — F199.2: is Broberg ID on here, and is the signed-in
 * user connected? Only a yes/no — the `sub` itself is never sent to the browser.
 * /api/auth/* is public in proxy.ts, so the session is checked here.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionUser(request.cookies);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await getUserById(session.sub);
  return NextResponse.json({ configured: isBidConfigured(), linked: Boolean(user?.bidSub) });
}
