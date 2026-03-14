import { NextRequest, NextResponse } from "next/server";
import { loadRegistry, saveRegistry } from "@/lib/site-registry";

/** POST /api/cms/registry/rename — rename a site in the registry */
export async function POST(request: NextRequest) {
  const { orgId, siteId, name } = (await request.json()) as {
    orgId: string;
    siteId: string;
    name: string;
  };

  if (!orgId || !siteId || !name?.trim()) {
    return NextResponse.json({ error: "orgId, siteId, and name required" }, { status: 400 });
  }

  const registry = await loadRegistry();
  if (!registry) {
    return NextResponse.json({ error: "No registry" }, { status: 404 });
  }

  const org = registry.orgs.find((o) => o.id === orgId);
  if (!org) {
    return NextResponse.json({ error: `Org "${orgId}" not found` }, { status: 404 });
  }

  const site = org.sites.find((s) => s.id === siteId);
  if (!site) {
    return NextResponse.json({ error: `Site "${siteId}" not found` }, { status: 404 });
  }

  site.name = name.trim();
  await saveRegistry(registry);

  return NextResponse.json({ ok: true, name: site.name });
}
