import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { NextRequest, NextResponse } from "next/server";
import { getSiteRole } from "@/lib/require-role";

export type SearchResult = {
  collection: string;
  collectionLabel: string;
  slug: string;
  title: string;
  status: string;
  /** Where the match was found — shown as sub-label in palette */
  matchedIn?: "title" | "body";
  /** Media-specific fields */
  mediaUrl?: string;
  mediaThumbnail?: string;
};

/**
 * GET /api/search?q=query
 * Searches all collections for documents matching the query.
 * Returns top 20 results ordered by relevance (exact → prefix → contains).
 */
export async function GET(req: NextRequest) {
  const role = await getSiteRole();
  if (!role) return NextResponse.json([], { status: 401 });
  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (!q) return NextResponse.json([]);

  try {
    const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);

    // Fetch all collections in parallel instead of sequentially
    const collectionResults = await Promise.all(
      config.collections.map(async (col) => {
        const { documents } = await cms.content.findMany(col.name, {}).catch(() => ({ documents: [] as any[] }));
        const hits: (SearchResult & { score: number })[] = [];

        for (const doc of documents) {
          const title = String(doc.data?.title ?? doc.data?.name ?? doc.data?.label ?? doc.slug);

          // Flatten ALL text values from doc.data so body/richtext/excerpt
          // fields are also searchable (not just slug + title).
          function flattenText(val: unknown, depth = 0): string {
            if (depth > 4) return "";
            if (typeof val === "string") return val;
            if (typeof val === "number") return String(val);
            if (Array.isArray(val)) return val.map((v) => flattenText(v, depth + 1)).join(" ");
            if (val && typeof val === "object") return Object.values(val).map((v) => flattenText(v, depth + 1)).join(" ");
            return "";
          }
          const bodyText = flattenText(doc.data);
          const haystack = `${doc.slug} ${title} ${doc.status} ${bodyText}`.toLowerCase();

          let score = 0;
          if (doc.slug === q || title.toLowerCase() === q) score = 100;
          else if (doc.slug.startsWith(q) || title.toLowerCase().startsWith(q)) score = 50;
          else if (`${doc.slug} ${title}`.toLowerCase().includes(q)) score = 20;
          else if (haystack.includes(q)) score = 10; // body/field match

          if (score > 0) {
            hits.push({
              collection: col.name,
              collectionLabel: col.label ?? col.name,
              slug: doc.slug,
              title,
              status: doc.status,
              matchedIn: score <= 10 ? "body" : "title",
              score,
            });
          }
        }
        return hits;
      })
    );

    // F44: Search media by EXIF + AI metadata
    const mediaHits: (SearchResult & { score: number })[] = [];
    try {
      const { readMediaMeta } = await import("@/lib/media/media-meta");
      const mediaMeta = await readMediaMeta();
      for (const m of mediaMeta) {
        const allTags = [...(m.tags ?? []), ...(m.aiTags ?? [])];
        const haystack = [
          m.name,
          m.aiCaption ?? "",
          m.aiAlt ?? "",
          ...allTags,
          m.exif?.make ?? "",
          m.exif?.model ?? "",
          m.exif?.lens ?? "",
          m.exif?.date ?? "",
          m.exif?.gpsLat != null ? `${m.exif.gpsLat.toFixed(2)}` : "",
          m.exif?.gpsLon != null ? `${m.exif.gpsLon.toFixed(2)}` : "",
        ].join(" ").toLowerCase();

        let score = 0;
        if (m.name.toLowerCase().includes(q)) score = 30;
        if (haystack.includes(q)) score = Math.max(score, 20);
        // Boost tags (exact match on user or AI tags)
        if (allTags.some((t) => t.toLowerCase() === q)) score = Math.max(score, 40);

        if (score > 0) {
          const url = m.folder ? `/uploads/${m.folder}/${m.name}` : `/uploads/${m.name}`;
          mediaHits.push({
            collection: "media",
            collectionLabel: "Media",
            slug: m.key,
            title: m.aiCaption ?? m.aiAlt ?? m.name,
            status: "media",
            mediaUrl: url,
            mediaThumbnail: url,
            score,
          });
        }
      }
    } catch { /* media-meta not available */ }

    const results = [...collectionResults.flat(), ...mediaHits];
    results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    const top20 = results.slice(0, 20).map(({ score: _s, ...r }) => r);
    return NextResponse.json(top20);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
