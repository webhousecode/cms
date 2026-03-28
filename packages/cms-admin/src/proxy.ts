import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "cms-session";

function getJwtSecret(): Uint8Array {
  const secret = process.env.CMS_JWT_SECRET ?? "cms-dev-secret-change-me-in-production";
  return new TextEncoder().encode(secret);
}

const PUBLIC_PATHS = [
  "/admin/login",
  "/admin/signup",
  "/admin/setup",
];

const PUBLIC_PREFIXES_ADMIN = [
  "/admin/invite/", // Public invite accept pages
];

const PUBLIC_PREFIXES = [
  "/api/auth/",
  "/api/admin/invitations/", // Invite accept flow (user not yet logged in)
  "/api/cms/scheduled/calendar.ics", // Auth via ?token= query param
  "/_next/",
  "/favicon",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Root path: always show landing page (login is at /admin/login)
  if (pathname === "/") {
    return NextResponse.rewrite(new URL("/home.html", request.url));
  }

  // Allow public paths
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (PUBLIC_PREFIXES_ADMIN.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // Only protect admin pages and API routes
  const isAdminPath = pathname.startsWith("/admin");
  const isCmsApi = pathname.startsWith("/api/cms");
  const isAdminApi = pathname.startsWith("/api/admin");
  const isMediaApi = pathname.startsWith("/api/media");
  const isPreviewApi = pathname.startsWith("/api/preview-");
  if (!isAdminPath && !isCmsApi && !isAdminApi && !isMediaApi && !isPreviewApi) return NextResponse.next();

  // Allow internal service calls with X-CMS-Service-Token header (matches CMS_JWT_SECRET)
  const serviceToken = request.headers.get("x-cms-service-token");
  if (serviceToken) {
    const secret = process.env.CMS_JWT_SECRET ?? "cms-dev-secret-change-me-in-production";
    if (serviceToken === secret) return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;

  const isApi = isCmsApi || isAdminApi || isMediaApi || isPreviewApi;

  if (!token) {
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // RSC prefetch requests (from sidebar links etc.) should not redirect
    // to login — that causes a redirect loop on the login page itself.
    const isRsc = request.headers.get("rsc") === "1" || request.nextUrl.searchParams.has("_rsc");
    if (isRsc) {
      return new NextResponse(null, { status: 204 });
    }
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    await jwtVerify(token, getJwtSecret());
    return NextResponse.next();
  } catch (err) {
    // RSC prefetch with invalid token — don't redirect, just reject silently
    const isRsc = request.headers.get("rsc") === "1" || request.nextUrl.searchParams.has("_rsc");
    if (isRsc && isAdminPath) {
      return new NextResponse(null, { status: 204 });
    }
    const response = isApi
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : NextResponse.redirect(new URL("/admin/login", request.url));

    // Clear invalid cookie
    response.cookies.delete(COOKIE_NAME);
    return response;
  }
}

export const config = {
  matcher: ["/", "/admin/:path*", "/api/cms/:path*", "/api/admin/:path*", "/api/media/:path*", "/api/preview-:path*"],
};
