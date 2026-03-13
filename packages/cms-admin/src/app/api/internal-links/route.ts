import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { NextRequest, NextResponse } from "next/server";

export type InternalLink = {
  title: string;
  url: string;
  collection: string;
  collectionLabel: string;
  slug: string;
  status: string;
};

/**
 * GET /api/internal-links?q=query
 *
 * Returns all documents with their resolved URLs.
 * URL = /{urlPrefix}/{slug} or /{slug} if no prefix.
 * Filters by title/slug/url when ?q= is provided.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";

  try {
    const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
    const results: InternalLink[] = [];

    for (const col of config.collections) {
      const { documents } = await cms.content.findMany(col.name, {});
      const prefix = col.urlPrefix?.replace(/\/$/, "") ?? "";

      for (const doc of documents) {
        const title = String(
          doc.data?.title ?? doc.data?.name ?? doc.data?.label ?? doc.slug
        );
        const url = prefix ? `${prefix}/${doc.slug}` : `/${doc.slug}`;

        if (q) {
          const haystack = `${title} ${doc.slug} ${url}`.toLowerCase();
          if (!haystack.includes(q)) continue;
        }

        results.push({
          title,
          url,
          collection: col.name,
          collectionLabel: col.label ?? col.name,
          slug: doc.slug,
          status: doc.status,
        });
      }
    }

    // Sort: published first, then alphabetically by title
    results.sort((a, b) => {
      if (a.status !== b.status) return a.status === "published" ? -1 : 1;
      return a.title.localeCompare(b.title);
    });

    return NextResponse.json(results.slice(0, 50));
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
