import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  createAccessToken,
  listTokens,
  revokeToken,
  ALL_PERMISSIONS,
  type Permission,
  type ResourceFilter,
  type IpFilter,
  type TokenScope,
} from "@/lib/access-tokens";
import { requirePermission } from "@/lib/permissions";

const VALID_LEGACY_SCOPES: TokenScope[] = ["admin", "content:read", "content:write", "deploy", "media"];

/** GET — list user's tokens (hashes only) */
export async function GET() {
  const user = await getSessionUser(await cookies());
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const tokens = await listTokens(user.id);
  return NextResponse.json({ tokens });
}

/** POST — create a new token. Returns the raw token ONCE.
 *
 *  Cloudflare-literal shape:
 *  { name, permissions, resources, ipFilters, notBefore?, notAfter? }
 *
 *  Legacy shape (one release cycle, auto-converted):
 *  { name, scopes: TokenScope[] }
 */
export async function POST(req: NextRequest) {
  const denied = await requirePermission("tokens.manage"); if (denied) return denied;
  const user = await getSessionUser(await cookies());
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: {
    name?: string;
    description?: string;
    permissions?: string[];
    resources?: ResourceFilter[];
    ipFilters?: IpFilter[];
    notBefore?: string | null;
    notAfter?: string | null;
    scopes?: string[]; // legacy
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  // Legacy shape — translate scopes -> let access-tokens.ts do the synth
  if (body.scopes && !body.permissions) {
    const scopes = body.scopes.filter((s): s is TokenScope => VALID_LEGACY_SCOPES.includes(s as TokenScope));
    if (scopes.length === 0) {
      return NextResponse.json({ error: "At least one valid scope required" }, { status: 400 });
    }
    const { token, stored } = await createAccessToken({
      name, userId: user.id, scopes,
      ...(body.description?.trim() ? { description: body.description.trim() } : {}),
    });
    return NextResponse.json({
      token, id: stored.id, name: stored.name,
      description: stored.description,
      displayPrefix: stored.displayPrefix,
      permissions: stored.permissions,
      resources: stored.resources,
      ipFilters: stored.ipFilters,
    });
  }

  // F134 shape
  const permissionSet = new Set(ALL_PERMISSIONS);
  permissionSet.add("*");
  const permissions = (body.permissions ?? []).filter((p): p is Permission => permissionSet.has(p as Permission));
  if (permissions.length === 0) {
    return NextResponse.json({ error: "At least one valid permission required" }, { status: 400 });
  }

  const resources = Array.isArray(body.resources) ? body.resources : [];
  const ipFilters = Array.isArray(body.ipFilters) ? body.ipFilters : [];

  // Basic shape validation — bail early on malformed rules
  for (const r of resources) {
    if (!r.scope || !r.effect || !("targets" in r)) {
      return NextResponse.json({ error: "Invalid resource filter shape" }, { status: 400 });
    }
  }
  for (const f of ipFilters) {
    if (!f.op || !Array.isArray(f.cidrs)) {
      return NextResponse.json({ error: "Invalid IP filter shape" }, { status: 400 });
    }
  }

  const { token, stored } = await createAccessToken({
    name,
    ...(body.description?.trim() ? { description: body.description.trim() } : {}),
    userId: user.id,
    permissions,
    resources,
    ipFilters,
    notBefore: body.notBefore ?? undefined,
    notAfter: body.notAfter ?? undefined,
  });

  return NextResponse.json({
    token, id: stored.id, name: stored.name,
    description: stored.description,
    displayPrefix: stored.displayPrefix,
    permissions: stored.permissions,
    resources: stored.resources,
    ipFilters: stored.ipFilters,
    notBefore: stored.notBefore,
    notAfter: stored.notAfter,
  });
}

/** DELETE — revoke a token by ID */
export async function DELETE(req: NextRequest) {
  const denied = await requirePermission("tokens.manage"); if (denied) return denied;
  const user = await getSessionUser(await cookies());
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing token id" }, { status: 400 });

  const ok = await revokeToken(id, user.id);
  return NextResponse.json({ ok });
}
