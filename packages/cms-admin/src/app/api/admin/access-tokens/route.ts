import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  createAccessToken,
  listTokens,
  revokeToken,
  type TokenScope,
} from "@/lib/access-tokens";

const VALID_SCOPES: TokenScope[] = ["admin", "content:read", "content:write", "deploy", "media"];

/** GET — list user's tokens (hashes only) */
export async function GET() {
  const user = await getSessionUser(await cookies());
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const tokens = await listTokens(user.id);
  return NextResponse.json({ tokens });
}

/** POST — create a new token. Returns the raw token ONCE. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(await cookies());
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { name?: string; scopes?: string[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const scopes = (body.scopes ?? ["admin"]).filter((s): s is TokenScope =>
    VALID_SCOPES.includes(s as TokenScope),
  );
  if (scopes.length === 0) {
    return NextResponse.json({ error: "At least one valid scope required" }, { status: 400 });
  }

  const { token, stored } = await createAccessToken(name, scopes, user.id);
  return NextResponse.json({ token, id: stored.id, name: stored.name, scopes: stored.scopes });
}

/** DELETE — revoke a token by ID */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(await cookies());
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing token id" }, { status: 400 });

  const ok = await revokeToken(id, user.id);
  return NextResponse.json({ ok });
}
