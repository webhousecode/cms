import { NextRequest, NextResponse } from "next/server";
import { loadRegistry, findSite } from "@/lib/site-registry";
import { getOrCreateInstance } from "@/lib/site-pool";

/** GET /api/cms/registry/stats?orgId=x&siteId=y — page count for a site */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const orgId = searchParams.get("orgId");
  const siteId = searchParams.get("siteId");

  if (!orgId || !siteId) {
    return NextResponse.json({ error: "orgId and siteId required" }, { status: 400 });
  }

  const registry = await loadRegistry();
  if (!registry) {
    return NextResponse.json({ pages: 0, collections: 0 });
  }

  const site = findSite(registry, orgId, siteId);
  if (!site) {
    return NextResponse.json({ pages: 0, collections: 0 });
  }

  try {
    const instance = await getOrCreateInstance(orgId, site);
    const collections = instance.config.collections;

    // Count documents in collections that have urlPrefix (= pages with URLs)
    let pages = 0;
    for (const col of collections) {
      if (col.urlPrefix !== undefined) {
        const { documents } = await instance.cms.content.findMany(col.name, {});
        pages += documents.filter((d) => d.status !== "trashed").length;
      }
    }

    return NextResponse.json({
      pages,
      collections: collections.length,
    });
  } catch {
    return NextResponse.json({ pages: 0, collections: 0 });
  }
}
