import { NextRequest, NextResponse } from "next/server";
import { loadRegistry, saveRegistry } from "@/lib/site-registry";

/** POST /api/cms/registry/rename — update site properties in the registry */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    orgId: string;
    siteId: string;
    name?: string;
    configPath?: string;
    contentDir?: string;
  };

  if (!body.orgId || !body.siteId) {
    return NextResponse.json({ error: "orgId and siteId required" }, { status: 400 });
  }

  const registry = await loadRegistry();
  if (!registry) {
    return NextResponse.json({ error: "No registry" }, { status: 404 });
  }

  const org = registry.orgs.find((o) => o.id === body.orgId);
  if (!org) {
    return NextResponse.json({ error: `Org "${body.orgId}" not found` }, { status: 404 });
  }

  const site = org.sites.find((s) => s.id === body.siteId);
  if (!site) {
    return NextResponse.json({ error: `Site "${body.siteId}" not found` }, { status: 404 });
  }

  if (body.name?.trim()) site.name = body.name.trim();
  if (body.configPath?.trim()) site.configPath = body.configPath.trim();
  if (body.contentDir !== undefined) site.contentDir = body.contentDir.trim() || undefined;
  await saveRegistry(registry);

  return NextResponse.json({ ok: true, site: { name: site.name, configPath: site.configPath, contentDir: site.contentDir } });
}
