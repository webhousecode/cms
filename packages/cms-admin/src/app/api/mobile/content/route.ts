import { NextResponse, type NextRequest } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { getAdminCmsForSite, getAdminConfigForSite } from "@/lib/cms";
import { loadRegistry } from "@/lib/site-registry";

/** Recursively serialize a field config for mobile consumption */
function serializeField(f: any): any {
  const base: any = {
    name: f.name,
    type: f.type,
    label: f.label ?? f.name,
    required: !!f.required,
  };
  if (f.options) base.options = f.options;
  if (f.placeholder) base.placeholder = f.placeholder;
  if (f.collection) base.collection = f.collection; // relation
  if (f.multiple) base.multiple = true; // relation multiple
  if (f.fields && Array.isArray(f.fields)) {
    base.fields = f.fields.map(serializeField); // array/object sub-fields
  }
  return base;
}

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
          fields: col.fields.map((f) => serializeField(f)),
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
