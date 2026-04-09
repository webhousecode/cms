/**
 * GET /admin/goto/[id]
 *
 * Resolves a short link created by `createGotoLink()` and redirects the user
 * to the stored admin path AFTER setting the `cms-active-org` and
 * `cms-active-site` cookies. This guarantees notification links land in the
 * correct workspace even when the recipient has multiple orgs/sites.
 *
 * Unknown ids redirect to /admin with a query param so the UI can toast.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveGotoLink } from "@/lib/goto-links";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const entry = await resolveGotoLink(id);

  if (!entry) {
    return NextResponse.redirect(new URL("/admin?error=goto-not-found", req.url));
  }

  // entry.path may include a query string and/or hash
  const target = new URL(entry.path, req.url);
  const res = NextResponse.redirect(target);

  const cookieOpts = {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax" as const,
  };
  res.cookies.set("cms-active-org", entry.orgId, cookieOpts);
  res.cookies.set("cms-active-site", entry.siteId, cookieOpts);

  return res;
}
