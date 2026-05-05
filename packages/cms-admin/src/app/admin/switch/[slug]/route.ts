/**
 * GET /admin/switch/[slug]?next=<path>
 *
 * Stable, bookmarkable URL for switching the active site. Looks up the
 * site by its `id` (which is already URL-safe in the registry) and sets
 * the `cms-active-org` + `cms-active-site` cookies, then redirects to
 * the `?next=` path (or `/admin` if omitted).
 *
 * Distinct from /admin/goto/[id] which resolves a SHORT-LINK to a
 * specific stored URL — this route is for ad-hoc switching by slug,
 * suitable for sharing between team members ("here, edit this on YOUR
 * account: https://webhouse.app/admin/switch/trail?next=/admin/content/posts").
 *
 * Slug = site.id (registry-wide unique by convention; first match wins
 * if not). Returns to /admin with ?error=site-not-found when unknown.
 */
import { NextRequest, NextResponse } from "next/server";
import { loadRegistry, findSite } from "@/lib/site-registry";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const next = req.nextUrl.searchParams.get("next") ?? "/admin";

  const registry = await loadRegistry();
  if (!registry) {
    return NextResponse.redirect(new URL("/admin?error=no-registry", req.url));
  }

  // Walk orgs to resolve (orgId, siteId). Site IDs are unique per org and
  // — by current convention — globally unique too; pick the first match.
  let resolved: { orgId: string; siteId: string } | null = null;
  for (const org of registry.orgs) {
    if (findSite(registry, org.id, slug)) {
      resolved = { orgId: org.id, siteId: slug };
      break;
    }
  }
  if (!resolved) {
    return NextResponse.redirect(
      new URL(`/admin?error=site-not-found&slug=${encodeURIComponent(slug)}`, req.url),
    );
  }

  // Build target — only allow same-origin paths (defense against
  // open-redirect via crafted ?next=https://evil.com).
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
  const target = new URL(safeNext, req.url);

  const res = NextResponse.redirect(target);
  const cookieOpts = {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax" as const,
  };
  res.cookies.set("cms-active-org", resolved.orgId, cookieOpts);
  res.cookies.set("cms-active-site", resolved.siteId, cookieOpts);
  return res;
}
