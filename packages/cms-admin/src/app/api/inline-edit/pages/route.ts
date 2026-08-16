import { NextResponse } from "next/server";
import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { getSiteRole } from "@/lib/require-role";
import { docPath } from "@/lib/doc-url";

/**
 * `GET /api/inline-edit/pages` — the link picker's page list (F164.2).
 *
 * Returns every PUBLISHED document on the active site as
 * `{ collection, slug, title, path, label }`, so the inline editor's link
 * dialog can offer "a page on the site" instead of asking an editor to type a
 * URL. The site is resolved from the request the same way every other route
 * does it (proxy injects the cookies for a `?site=` token caller) — this route
 * never reads `?site=` itself.
 *
 * Read-only and narrow on purpose: it is reachable by an editSession bearer
 * token (allowlisted in proxy.ts), which is a long-lived token living in a
 * browser on a public site. It exposes titles + public paths — the same
 * information any visitor can read off the site's own navigation — and nothing
 * else. Drafts are excluded: an editor must not be able to link to a page the
 * public cannot open.
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

interface LinkablePage {
  collection: string;
  slug: string;
  title: string;
  path: string;
  /** Human label for the collection, for the picker's grouping tag. */
  label: string;
}

export async function GET() {
  const role = await getSiteRole();
  if (!role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
  }

  const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
  const pages: LinkablePage[] = [];

  for (const col of config.collections) {
    const c = col as typeof col & {
      urlPrefix?: string;
      urlPattern?: string;
      titleField?: string;
      hidden?: boolean;
    };
    // A collection with no public URL isn't a link target (settings/globals).
    if (c.hidden) continue;

    let docs: Array<Record<string, unknown>> = [];
    try {
      const { documents } = await cms.content.findMany(col.name, {});
      docs = documents as unknown as Array<Record<string, unknown>>;
    } catch {
      continue; // a collection that can't be read must not fail the whole list
    }

    for (const doc of docs) {
      if (doc.status && doc.status !== "published") continue;
      const slug = typeof doc.slug === "string" ? doc.slug : "";
      if (!slug) continue;
      const data = (doc.data ?? {}) as Record<string, unknown>;
      const titleField = c.titleField ?? "title";
      const rawTitle = data[titleField] ?? data.title ?? data.name;
      pages.push({
        collection: col.name,
        slug,
        title: typeof rawTitle === "string" && rawTitle.trim() ? rawTitle : slug,
        path: docPath(
          { slug, locale: typeof doc.locale === "string" ? doc.locale : undefined, data },
          {
            collection: col.name,
            urlPrefix: c.urlPrefix,
            urlPattern: c.urlPattern,
            localeStrategy: (config as { localeStrategy?: "prefix-all" | "prefix-other" | "none" })
              .localeStrategy,
            defaultLocale: (config as { defaultLocale?: string }).defaultLocale,
          },
        ),
        label: col.label ?? col.name,
      });
    }
  }

  pages.sort((a, b) => a.title.localeCompare(b.title, "da"));
  return NextResponse.json({ pages }, { headers: CORS_HEADERS });
}
