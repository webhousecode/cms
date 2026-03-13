import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { NextRequest, NextResponse } from "next/server";

export type SearchResult = {
  collection: string;
  collectionLabel: string;
  slug: string;
  title: string;
  status: string;
};

/**
 * GET /api/search?q=query
 * Searches all collections for documents matching the query.
 * Returns top 20 results ordered by relevance (exact → prefix → contains).
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (!q) return NextResponse.json([]);

  try {
    const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
    const results: (SearchResult & { score: number })[] = [];

    for (const col of config.collections) {
      const { documents } = await cms.content.findMany(col.name, {});
      for (const doc of documents) {
        const title = String(
          doc.data?.title ?? doc.data?.name ?? doc.data?.label ?? doc.slug
        );
        const haystack = `${doc.slug} ${title} ${doc.status}`.toLowerCase();

        let score = 0;
        if (doc.slug === q || title.toLowerCase() === q) score = 100;
        else if (doc.slug.startsWith(q) || title.toLowerCase().startsWith(q)) score = 50;
        else if (haystack.includes(q)) score = 10;

        if (score > 0) {
          results.push({
            collection: col.name,
            collectionLabel: col.label ?? col.name,
            slug: doc.slug,
            title,
            status: doc.status,
            score,
          });
        }
      }
    }

    results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    const top20 = results.slice(0, 20).map(({ score: _s, ...r }) => r);
    return NextResponse.json(top20);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
