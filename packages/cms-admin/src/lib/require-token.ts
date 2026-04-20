/**
 * F134 requireToken middleware — authorise a request via Bearer access token.
 *
 * Usage:
 *   const auth = await requireToken(req, "deploy:trigger", `site:${siteId}`);
 *   if (auth instanceof NextResponse) return auth; // 401/403
 *   // proceed — auth is the validated StoredToken
 *
 * Falls through to session-based auth if no Authorization header is present,
 * so existing in-browser usage keeps working. Session users bypass the
 * token evaluator and rely on their team role (unchanged semantics).
 */
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  evaluateToken,
  verifyAccessToken,
  type Permission,
  type Resource,
  type StoredToken,
} from "./access-tokens";
import { getSessionUser } from "./auth";

export type AuthResult = StoredToken | { via: "session"; userId: string };

/** Extract the caller's IP from standard proxy headers, falling back to
 * the request's remoteAddress. Takes the first IP in X-Forwarded-For
 * since that's the original client; the rest is proxy chain. */
function clientIpFrom(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  // Next's NextRequest.ip is only populated on Vercel / some edge hosts.
  // On self-hosted Node it's undefined — return empty so IP filters that
  // require a match fail closed.
  return "";
}

function extractBearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m ? m[1] : null;
}

/**
 * Authorise a request. Returns the validated StoredToken (or session user
 * wrapper) on success; returns a NextResponse 401/403 on failure.
 *
 * @param permission  the discrete capability being exercised
 * @param resource    the resource string the request is reaching for,
 *                    e.g. `site:trail`, `admin:deploy`, `org:settings`
 */
export async function requireToken(
  req: NextRequest,
  permission: Permission,
  resource: Resource,
): Promise<AuthResult | NextResponse> {
  const bearer = extractBearer(req);

  if (bearer) {
    const token = await verifyAccessToken(bearer);
    if (!token) {
      return NextResponse.json({ error: "Invalid access token" }, { status: 401 });
    }

    const ip = clientIpFrom(req);
    const result = evaluateToken(token, permission, resource, ip, new Date());
    if (!result.allow) {
      return NextResponse.json(
        { error: "Forbidden", reason: result.reason ?? "token denied" },
        { status: 403 },
      );
    }
    return token;
  }

  // No Bearer — fall through to session-based auth. Admins/editors keep
  // their existing role-based access via getSessionUser + team membership.
  const user = await getSessionUser(await cookies());
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return { via: "session", userId: user.id };
}

/** Helper for responses that need to know whether the caller was a token
 * or a session — mostly for audit logging. */
export function isTokenAuth(a: AuthResult): a is StoredToken {
  return "hash" in a;
}
