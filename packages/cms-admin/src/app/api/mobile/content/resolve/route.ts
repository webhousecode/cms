import { NextRequest, NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { getAdminCmsForSite, getAdminConfigForSite } from "@/lib/cms";

/**
 * GET /api/mobile/content/resolve?orgId=...&siteId=...&path=/blog/my-post
 *
 * Resolve a URL path to a collection + slug.
 * Used by the Edit FAB on preview — user taps edit while viewing a page,
 * this endpoint figures out which document they're looking at.
 */
export async function GET(req: NextRequest) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const orgId = req.nextUrl.searchParams.get("orgId");
  const siteId = req.nextUrl.searchParams.get("siteId");
  const urlPath = req.nextUrl.searchParams.get("path");
  if (!orgId || !siteId || !urlPath) {
    return NextResponse.json({ error: "orgId, siteId, and path required" }, { status: 400 });
  }

  try {
    const [cms, config] = await Promise.all([
      getAdminCmsForSite(orgId, siteId),
      getAdminConfigForSite(orgId, siteId),
    ]);
    if (!cms || !config) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    // Clean path: strip query, hash, trailing slash, locale prefix
    let cleanPath = urlPath.split("?")[0].split("#")[0].replace(/\/$/, "") || "/";

    // Try stripping locale prefix (e.g. /da/blog/post → /blog/post)
    const locales = (config as any).locales ?? [];
    for (const loc of locales) {
      if (cleanPath.startsWith(`/${loc}/`)) {
        cleanPath = cleanPath.slice(loc.length + 1);
        break;
      }
    }

    // Try each collection's urlPrefix
    for (const col of config.collections) {
      const prefix = ((col as any).urlPrefix ?? `/${col.name}`).replace(/\/$/, "");
      if (!prefix) continue;

      if (cleanPath.startsWith(prefix + "/")) {
        const remainder = cleanPath.slice(prefix.length + 1);

        // Handle urlPattern with category: /:category/:slug
        const urlPattern = (col as any).urlPattern;
        if (urlPattern && urlPattern.includes(":category") && urlPattern.includes(":slug")) {
          const parts = remainder.split("/");
          if (parts.length >= 2) {
            const slug = parts[parts.length - 1];
            const doc = await cms.content.findBySlug(col.name, slug).catch(() => null);
            if (doc) {
              return NextResponse.json({ collection: col.name, slug, label: col.label ?? col.name });
            }
          }
        }

        // Simple: remainder is the slug
        const slug = remainder.replace(/\/$/, "");
        if (slug && !slug.includes("/")) {
          const doc = await cms.content.findBySlug(col.name, slug).catch(() => null);
          if (doc) {
            return NextResponse.json({ collection: col.name, slug, label: col.label ?? col.name });
          }
        }
      }

      // Exact match for index/home pages
      if (cleanPath === prefix || cleanPath === prefix + "/") {
        // Check for index or home slug
        for (const trySlug of ["index", "home", col.name]) {
          const doc = await cms.content.findBySlug(col.name, trySlug).catch(() => null);
          if (doc) {
            return NextResponse.json({ collection: col.name, slug: trySlug, label: col.label ?? col.name });
          }
        }
      }
    }

    // Homepage: try globals or pages/home/index
    if (cleanPath === "/" || cleanPath === "") {
      for (const col of config.collections) {
        if ((col as any).kind === "global") {
          const { documents } = await cms.content.findMany(col.name, {});
          if (documents.length > 0) {
            return NextResponse.json({ collection: col.name, slug: documents[0].slug, label: col.label ?? col.name });
          }
        }
        for (const trySlug of ["home", "index", "frontpage"]) {
          const doc = await cms.content.findBySlug(col.name, trySlug).catch(() => null);
          if (doc) {
            return NextResponse.json({ collection: col.name, slug: trySlug, label: col.label ?? col.name });
          }
        }
      }
    }

    return NextResponse.json({ error: "No matching document found for this URL" }, { status: 404 });
  } catch (err) {
    console.error("[mobile/content/resolve] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
