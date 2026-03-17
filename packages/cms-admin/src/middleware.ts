import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "cms-session";

function getJwtSecret(): Uint8Array {
  const secret = process.env.CMS_JWT_SECRET ?? "cms-dev-secret-change-me-in-production";
  return new TextEncoder().encode(secret);
}

const PUBLIC_PATHS = [
  "/admin/login",
  "/admin/setup",
];

const PUBLIC_PREFIXES = [
  "/api/auth/",
  "/_next/",
  "/favicon",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Root path: authenticated → /admin, unauthenticated → landing page
  if (pathname === "/") {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    if (token) {
      try {
        await jwtVerify(token, getJwtSecret());
        return NextResponse.redirect(new URL("/admin", request.url));
      } catch { /* fall through to landing */ }
    }
    return NextResponse.rewrite(new URL("/home.html", request.url));
  }

  // Allow public paths
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // Only protect admin pages and CMS API routes
  const isAdminPath = pathname.startsWith("/admin");
  const isCmsApi = pathname.startsWith("/api/cms");
  if (!isAdminPath && !isCmsApi) return NextResponse.next();

  // Allow internal service calls with X-CMS-Service-Token header (matches CMS_JWT_SECRET)
  const serviceToken = request.headers.get("x-cms-service-token");
  if (serviceToken) {
    const secret = process.env.CMS_JWT_SECRET ?? "cms-dev-secret-change-me-in-production";
    if (serviceToken === secret) return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    console.log(`[middleware] NO TOKEN for ${pathname} (${request.method})`);
    if (isCmsApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    await jwtVerify(token, getJwtSecret());
    return NextResponse.next();
  } catch (err) {
    console.log(`[middleware] JWT VERIFY FAILED for ${pathname}: ${err instanceof Error ? err.message : err}`);
    const response = isCmsApi
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : NextResponse.redirect(new URL("/admin/login", request.url));

    // Clear invalid cookie
    response.cookies.delete(COOKIE_NAME);
    return response;
  }
}

export const config = {
  matcher: ["/", "/admin/:path*", "/api/cms/:path*"],
};
