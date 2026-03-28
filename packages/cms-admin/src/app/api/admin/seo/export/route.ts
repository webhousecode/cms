import { NextRequest, NextResponse } from "next/server";
import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { calculateSeoScore, type SeoFields } from "@/lib/seo/score";

/**
 * GET /api/admin/seo/export?format=csv|json
 * Export SEO report for all documents.
 */
export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get("format") ?? "csv";

  try {
    const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
    const rows: Array<Record<string, string | number | boolean>> = [];

    for (const col of config.collections) {
      try {
        const { documents } = await cms.content.findMany(col.name, {});
        for (const doc of documents) {
          if ((doc.status as string) === "trashed") continue;
          const data = (doc as { data?: Record<string, unknown> }).data ?? {};
          const seo = (data._seo as SeoFields) ?? {};
          const { score, details } = calculateSeoScore({ slug: doc.slug, data }, seo);

          rows.push({
            collection: col.name,
            slug: doc.slug,
            title: String(data.title ?? data.name ?? doc.slug),
            status: doc.status as string,
            score,
            metaTitle: seo.metaTitle ?? "",
            metaDescription: seo.metaDescription ?? "",
            keywords: (seo.keywords ?? []).join("; "),
            ogImage: seo.ogImage ?? "",
            robots: seo.robots ?? "index,follow",
            issues: details.filter((d) => d.status === "fail").map((d) => d.label).join("; "),
            warnings: details.filter((d) => d.status === "warn").map((d) => d.label).join("; "),
            lastOptimized: seo.lastOptimized ?? "",
          });
        }
      } catch { /* skip */ }
    }

    if (format === "json") {
      return NextResponse.json(rows, {
        headers: {
          "Content-Disposition": `attachment; filename="seo-report.json"`,
        },
      });
    }

    // CSV export
    if (rows.length === 0) {
      return new NextResponse("No data", { status: 204 });
    }

    const headers = Object.keys(rows[0]);
    const csvLines = [
      headers.join(","),
      ...rows.map((row) =>
        headers.map((h) => {
          const val = String(row[h] ?? "");
          // Escape CSV values that contain commas, quotes, or newlines
          return val.includes(",") || val.includes('"') || val.includes("\n")
            ? `"${val.replace(/"/g, '""')}"`
            : val;
        }).join(","),
      ),
    ];

    return new NextResponse(csvLines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="seo-report.csv"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Export failed" },
      { status: 500 },
    );
  }
}
