import { NextResponse } from "next/server";
import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { getSiteRole } from "@/lib/require-role";
import { hasPermission, ROLE_PERMISSIONS } from "@/lib/permissions";
import { readSiteConfig } from "@/lib/site-config";
import {
  buildLinkablePages,
  parseSitemapLocs,
  type CmsDocIndexEntry,
} from "@/lib/linkable-pages";

/**
 * `GET /api/inline-edit/pages` — the link picker's page list (F164.2/F164.5).
 *
 * The list comes from the SITE'S OWN sitemap, not from paths computed out of
 * cms.config — see lib/linkable-pages.ts for the two measured failure modes
 * that motivated the change. The CMS supplies titles so the picker stays
 * searchable by name; it never supplies an address.
 *
 * Read-only and narrow on purpose: reachable by an editSession bearer token
 * (allowlisted in proxy.ts), which lives in a browser on a public site. It
 * exposes page titles and public URLs — what the site's own navigation and
 * sitemap already publish — and nothing else.
 */

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...CORS_HEADERS,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function GET() {
  // Permission-gated, not "has any role" — a viewer has no business enumerating
  // a site's pages.
  //
  // NOT requirePermission(): it runs tryTokenAuth() on ANY Bearer header and
  // 401s a token it cannot verify as a `wh_` access token — which is every
  // editSession JWT, i.e. exactly the caller this endpoint exists for. Shipping
  // that turned the live link dialog into "Fejl — prøv igen" while the same
  // token still returned 200 on /api/cms/*. This is the pattern
  // /api/inline-edit/token uses for the same reason: read the role from the
  // session the proxy resolved, then check the permission on it.
  const role = await getSiteRole();
  if (!role || !hasPermission(ROLE_PERMISSIONS[role] ?? [], "content.edit")) {
    return NextResponse.json(
      { error: "Forbidden — content.edit required" },
      { status: 403, headers: CORS_HEADERS },
    );
  }

  const siteConfig = await readSiteConfig();
  const base = (siteConfig.previewSiteUrl ?? "").replace(/\/$/, "");
  if (!base) {
    return NextResponse.json(
      {
        pages: [],
        error: "no-preview-url",
        message:
          "Sitet har ingen adresse i indstillingerne, så vi kan ikke hente dets sideoversigt. Sæt site-adressen under Site Settings.",
      },
      { headers: CORS_HEADERS },
    );
  }

  let locs: string[];
  try {
    const res = await fetch(`${base}/sitemap.xml`, {
      headers: { accept: "application/xml,text/xml" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`sitemap ${res.status}`);
    locs = parseSitemapLocs(await res.text());
  } catch {
    // Explicit and visible — NEVER a silent fall back to computed paths. Guessed
    // addresses are exactly what this endpoint was rebuilt to stop offering, and
    // a quiet fallback would reintroduce them the first time a sitemap 404s.
    return NextResponse.json(
      {
        pages: [],
        error: "no-sitemap",
        message: `Kunne ikke hente ${base}/sitemap.xml. Vælgeren viser kun sider sitet selv oplyser, så listen er tom indtil sitemappet svarer.`,
      },
      { headers: CORS_HEADERS },
    );
  }

  // CMS documents indexed BY SLUG — titles only. A miss just means the page is
  // listed under a title derived from its URL.
  const index = new Map<string, CmsDocIndexEntry>();
  try {
    const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
    for (const col of config.collections) {
      const c = col as typeof col & { titleField?: string };
      let docs: Array<Record<string, unknown>> = [];
      try {
        const { documents } = await cms.content.findMany(col.name, {});
        docs = documents as unknown as Array<Record<string, unknown>>;
      } catch {
        continue;
      }
      for (const doc of docs) {
        if (doc.status && doc.status !== "published") continue;
        const slug = typeof doc.slug === "string" ? doc.slug : "";
        if (!slug || index.has(slug)) continue;
        const data = (doc.data ?? {}) as Record<string, unknown>;
        const raw = data[c.titleField ?? "title"] ?? data.title ?? data.name;
        index.set(slug, {
          collection: col.name,
          slug,
          title: typeof raw === "string" && raw.trim() ? raw : slug,
          label: col.label ?? col.name,
        });
      }
    }
  } catch {
    // Titles are enrichment. Losing them must not lose the page list.
  }

  return NextResponse.json(
    { pages: buildLinkablePages(locs, index), source: "sitemap" },
    { headers: CORS_HEADERS },
  );
}
