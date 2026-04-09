import { NextResponse, type NextRequest } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { getAdminCmsForSite, getAdminConfigForSite } from "@/lib/cms";
import { loadRegistry } from "@/lib/site-registry";

/**
 * GET /api/mobile/content?orgId=...&siteId=...
 *
 * Returns all collections for a site with their field schemas and document counts.
 * Mobile equivalent of GET /api/schema + GET /api/cms/:collection combined.
 */
export async function GET(req: NextRequest) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const orgId = req.nextUrl.searchParams.get("orgId");
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!orgId || !siteId) {
    return NextResponse.json({ error: "orgId and siteId required" }, { status: 400 });
  }

  try {
    const [cms, config] = await Promise.all([
      getAdminCmsForSite(orgId, siteId),
      getAdminConfigForSite(orgId, siteId),
    ]);
    if (!cms || !config) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    // Fetch doc counts in parallel
    const collections = await Promise.all(
      config.collections.map(async (col) => {
        let docCount = 0;
        try {
          const { documents } = await cms.content.findMany(col.name, {});
          docCount = documents.filter((d: any) => d.status !== "trashed").length;
        } catch { /* empty collection */ }

        return {
          name: col.name,
          label: col.label ?? col.name,
          kind: (col as any).kind ?? "page",
          description: (col as any).description,
          urlPrefix: (col as any).urlPrefix,
          fields: col.fields.map((f) => ({
            name: f.name,
            type: f.type,
            label: (f as any).label ?? f.name,
            required: !!(f as any).required,
            options: (f as any).options,
            placeholder: (f as any).placeholder,
            collection: (f as any).collection, // for relation fields
          })),
          docCount,
        };
      }),
    );

    return NextResponse.json({ collections });
  } catch (err) {
    console.error("[mobile/content] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
