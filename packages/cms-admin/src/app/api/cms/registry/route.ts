import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { getSessionUser, type UserRole } from "@/lib/auth";
import { requireInstanceAdmin, isInstanceAdmin, requirePermissionOnSite, siteAdminUpdateAllowed } from "@/lib/instance-admin";
import { CAPABILITY_PROFILES } from "@/lib/capabilities-shared";
import { getAccessibleSiteIds } from "@/lib/team-access";
import {
  loadRegistry,
  saveRegistry,
  addOrg,
  addSite,
  removeOrg,
  removeSite,
  bootstrapRegistryFromEnv,
  type Registry,
  type SiteEntry,
} from "@/lib/site-registry";

/**
 * GET /api/cms/registry — return registry filtered by user access.
 *
 * Admins see everything. Non-admins see only orgs that contain at least
 * one site they have team membership on, and within those orgs only the
 * sites they can access.
 */
export async function GET() {
  const registry = await loadRegistry();
  if (!registry) {
    return NextResponse.json({ mode: "single-site", registry: null });
  }

  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admins see the full registry
  const users = await import("@/lib/auth").then((m) => m.getUsers());
  const user = users.find((u) => u.id === session.sub);
  // F208 — a session outliving its user (deleted, still within the JWT's 7
  // days) used to fall through to "admin" and receive every org and site.
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (user.role ?? "admin") as UserRole;
  if (role === "admin") {
    return NextResponse.json({ mode: "multi-site", registry });
  }

  // Non-admins: filter to only sites they have team membership on
  const accessibleIds = await getAccessibleSiteIds(session.sub);
  const accessSet = new Set(accessibleIds);

  const filteredOrgs = registry.orgs
    .map((org) => ({
      ...org,
      sites: org.sites.filter((s) => accessSet.has(s.id)),
    }))
    .filter((org) => org.sites.length > 0);

  const filteredRegistry: Registry = {
    ...registry,
    orgs: filteredOrgs,
    // Default to the first accessible org/site
    defaultOrgId: filteredOrgs[0]?.id ?? registry.defaultOrgId,
    defaultSiteId: filteredOrgs[0]?.sites[0]?.id ?? registry.defaultSiteId,
  };

  return NextResponse.json({ mode: "multi-site", registry: filteredRegistry });
}

/**
 * Security W41 NY-K3 — the registry is the whole instance: every org, every
 * site and the file paths the server loads code from. This used to need only
 * settings.edit on the ACTIVE site and then acted on the org/site named in the
 * body, so any customer's site admin could re-point another tenant's config
 * (code execution via jiti), make themselves its only admin, or delete orgs.
 * Now: instance admin for everything, except two edits a site's own admin
 * makes from Site Settings — update-site on a site where they hold
 * settings.edit (paths unchanged) and update-org name/type on an org where
 * they administer a site.
 */
/** POST /api/cms/registry — create/bootstrap registry or add org/site */
export async function POST(request: NextRequest) {
  const body = await request.json() as {
    action: "bootstrap" | "add-org" | "add-site" | "update-org" | "update-site";
    orgName?: string;
    orgId?: string;
    siteId?: string;
    orgType?: string;
    orgPlan?: string;
    site?: SiteEntry;
    updates?: Partial<SiteEntry>;
  };

  if (body.action === "update-site" && !(await isInstanceAdmin())) {
    if (!body.orgId || !body.siteId) return NextResponse.json({ error: "orgId and siteId required" }, { status: 400 });
    const denied = await requirePermissionOnSite("settings.edit", body.orgId, body.siteId); if (denied) return denied;
    const reg = await loadRegistry();
    const current = reg?.orgs.find((o) => o.id === body.orgId)?.sites.find((s) => s.id === body.siteId);
    if (!current) return NextResponse.json({ error: "Site not found" }, { status: 404 });
    if (!siteAdminUpdateAllowed(current, (body.updates ?? {}) as Record<string, unknown>)) {
      return NextResponse.json({ error: "Only the CMS instance admin can change a site's paths" }, { status: 403 });
    }
  } else if (body.action === "update-org" && !(await isInstanceAdmin())) {
    if (!body.orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });
    const reg = await loadRegistry();
    const org = reg?.orgs.find((o) => o.id === body.orgId);
    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });
    let orgAdmin = false;
    for (const site of org.sites) {
      if (!(await requirePermissionOnSite("settings.edit", org.id, site.id))) { orgAdmin = true; break; }
    }
    if (!orgAdmin) return NextResponse.json({ error: "No access to that organization" }, { status: 403 });
    if (body.orgPlan !== undefined && body.orgPlan !== org.plan) {
      return NextResponse.json({ error: "Only the CMS instance admin can change an organization's plan" }, { status: 403 });
    }
  } else {
    const denied = await requireInstanceAdmin(); if (denied) return denied;
  }

  if (body.action === "bootstrap") {
    const existing = await loadRegistry();
    if (existing) {
      return NextResponse.json({ error: "Registry already exists" }, { status: 409 });
    }
    const registry = await bootstrapRegistryFromEnv();
    return NextResponse.json({ ok: true, registry });
  }

  if (body.action === "add-org") {
    if (!body.orgName) {
      return NextResponse.json({ error: "orgName required" }, { status: 400 });
    }
    const org = await addOrg(body.orgName, body.orgType as never, body.orgPlan as never);
    return NextResponse.json({ ok: true, org });
  }

  if (body.action === "update-org") {
    if (!body.orgId) {
      return NextResponse.json({ error: "orgId required" }, { status: 400 });
    }
    const { updateOrg } = await import("@/lib/site-registry");
    const org = await updateOrg(body.orgId, {
      name: body.orgName,
      type: body.orgType as never,
      plan: body.orgPlan as never,
    });
    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });
    return NextResponse.json({ ok: true, org });
  }

  if (body.action === "update-site") {
    if (!body.orgId || !body.siteId) {
      return NextResponse.json({ error: "orgId and siteId required" }, { status: 400 });
    }
    const { updateSite } = await import("@/lib/site-registry");
    const pathsChanged =
      body.updates?.configPath !== undefined ||
      body.updates?.contentDir !== undefined ||
      body.updates?.uploadDir !== undefined;
    const site = await updateSite(body.orgId, body.siteId, body.updates ?? {});
    if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });
    if (pathsChanged) {
      const { invalidate } = await import("@/lib/site-pool");
      invalidate(body.orgId, body.siteId);
    }
    return NextResponse.json({ ok: true, site });
  }

  if (body.action === "add-site") {
    if (!body.orgId || !body.site) {
      return NextResponse.json({ error: "orgId and site required" }, { status: 400 });
    }
    // F208 — an existing id (in ANY org) is refused before anything is
    // written: below, this handler replaces the site's team.json with the
    // caller alone, which on an existing site would wipe its team.
    const current = await loadRegistry();
    if (current?.orgs.some((o) => o.sites.some((s) => s.id === body.site!.id))) {
      return NextResponse.json({ error: `Site ID "${body.site.id}" already exists` }, { status: 409 });
    }
    await addSite(body.orgId, body.site);

    // Auto-add the creating user as admin team member
    const cookieStore = await cookies();
    const session = await getSessionUser(cookieStore);
    if (session) {
      const site = body.site;
      let dataDir: string;
      if (site.adapter === "github" || site.configPath.startsWith("github://")) {
        const configPath = process.env.CMS_CONFIG_PATH;
        const cacheBase = configPath
          ? join(dirname(resolve(configPath)), ".cache")
          : join(process.env.HOME ?? "/tmp", ".webhouse", ".cache");
        dataDir = join(cacheBase, "sites", site.id, "_data");
      } else {
        const projDir = dirname(resolve(site.configPath));
        const contentDir = site.contentDir ?? join(projDir, "content");
        dataDir = join(contentDir, "..", "_data");
      }
      const teamFile = join(dataDir, "team.json");
      const team = [{ userId: session.sub, role: "admin", addedAt: new Date().toISOString() }];
      await mkdir(dataDir, { recursive: true });
      await writeFile(teamFile, JSON.stringify(team, null, 2));

      // F153: a brand-new site starts on the Minimal profile (content + media
      // only) per the F153.3 onboarding decision. Existing sites are untouched
      // (no stored capabilities → all-on). Admins enable features in
      // Site Settings → Features. `flag: "wx"` never clobbers an existing config.
      try {
        const siteConfigFile = join(dataDir, "site-config.json");
        await writeFile(
          siteConfigFile,
          JSON.stringify({ capabilities: CAPABILITY_PROFILES.minimal }, null, 2),
          { flag: "wx" },
        );
      } catch { /* config already exists or non-fatal */ }

      if (site.adapter !== "github" && !site.configPath.startsWith("github://")) {
        const projDir = dirname(resolve(site.configPath));
        const contentDir = site.contentDir ?? join(projDir, "content");
        const uploadDir = site.uploadDir ?? join(projDir, "public", "uploads");
        await mkdir(contentDir, { recursive: true });
        await mkdir(uploadDir, { recursive: true });
      }

      if (site.adapter === "github" || site.configPath.startsWith("github://")) {
        try {
          const githubToken = cookieStore.get("github-token")?.value;
          if (githubToken) {
            const serviceTokenFile = join(dataDir, "github-service-token.json");
            await writeFile(serviceTokenFile, JSON.stringify({ token: githubToken }, null, 2));
          }
        } catch { /* non-fatal */ }
      }
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

/** DELETE /api/cms/registry — remove org or site (instance admin only — W41 NY-K3) */
export async function DELETE(request: NextRequest) {
  const denied = await requireInstanceAdmin(); if (denied) return denied;

  const { searchParams } = request.nextUrl;
  const orgId = searchParams.get("orgId");
  const siteId = searchParams.get("siteId");

  if (!orgId) {
    return NextResponse.json({ error: "orgId required" }, { status: 400 });
  }

  if (siteId) {
    await removeSite(orgId, siteId);
  } else {
    await removeOrg(orgId);
  }

  return NextResponse.json({ ok: true });
}

/** PUT /api/cms/registry — update full registry (instance admin only — W41 NY-K3) */
export async function PUT(request: NextRequest) {
  const denied = await requireInstanceAdmin(); if (denied) return denied;

  const registry = await request.json() as Registry;
  await saveRegistry(registry);
  return NextResponse.json({ ok: true });
}
