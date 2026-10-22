import { NextRequest, NextResponse } from "next/server";
import { loadRegistry, saveRegistry } from "@/lib/site-registry";
import { isInstanceAdmin, requirePermissionOnSite, siteAdminUpdateAllowed } from "@/lib/instance-admin";

/**
 * POST /api/cms/registry/rename — update site properties in the registry.
 * Security W41 H1→K: had no gate at all, so any session could re-point any
 * site's configPath at an uploaded .ts (loaded by jiti → code execution).
 * Now: settings.edit on THAT site; changing a path needs the instance admin.
 */
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

  const denied = await requirePermissionOnSite("settings.edit", body.orgId, body.siteId);
  if (denied) return denied;

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

  const { orgId: _o, siteId: _s, ...updates } = body;
  if (!(await isInstanceAdmin()) && !siteAdminUpdateAllowed(site, updates)) {
    return NextResponse.json({ error: "Only the CMS instance admin can change a site's paths" }, { status: 403 });
  }

  if (body.name?.trim()) site.name = body.name.trim();
  if (body.configPath?.trim()) site.configPath = body.configPath.trim();
  if (body.contentDir !== undefined) site.contentDir = body.contentDir.trim() || undefined;
  await saveRegistry(registry);

  return NextResponse.json({ ok: true, site: { name: site.name, configPath: site.configPath, contentDir: site.contentDir } });
}
