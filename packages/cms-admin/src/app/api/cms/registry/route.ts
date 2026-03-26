import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { getSessionUser } from "@/lib/auth";
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

/** GET /api/cms/registry — return full registry (or null for single-site) */
export async function GET() {
  const registry = await loadRegistry();
  if (!registry) {
    return NextResponse.json({ mode: "single-site", registry: null });
  }
  return NextResponse.json({ mode: "multi-site", registry });
}

/** POST /api/cms/registry — create/bootstrap registry or add org/site */
export async function POST(request: NextRequest) {
  const body = await request.json() as {
    action: "bootstrap" | "add-org" | "add-site" | "update-org";
    orgName?: string;
    orgId?: string;
    orgType?: string;
    orgPlan?: string;
    site?: SiteEntry;
  };

  if (body.action === "bootstrap") {
    // Create registry from current CMS_CONFIG_PATH
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
    const org = await addOrg(body.orgName, body.orgType as any, body.orgPlan as any);
    return NextResponse.json({ ok: true, org });
  }

  if (body.action === "update-org") {
    if (!body.orgId) {
      return NextResponse.json({ error: "orgId required" }, { status: 400 });
    }
    const { updateOrg } = await import("@/lib/site-registry");
    const org = await updateOrg(body.orgId, {
      name: body.orgName,
      type: body.orgType as any,
      plan: body.orgPlan as any,
    });
    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });
    return NextResponse.json({ ok: true, org });
  }

  if (body.action === "add-site") {
    if (!body.orgId || !body.site) {
      return NextResponse.json({ error: "orgId and site required" }, { status: 400 });
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

      // Create essential directories for filesystem sites
      if (site.adapter !== "github" && !site.configPath.startsWith("github://")) {
        const projDir = dirname(resolve(site.configPath));
        const contentDir = site.contentDir ?? join(projDir, "content");
        const uploadDir = site.uploadDir ?? join(projDir, "public", "uploads");
        await mkdir(contentDir, { recursive: true });
        await mkdir(uploadDir, { recursive: true });
      }
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

/** DELETE /api/cms/registry — remove org or site */
export async function DELETE(request: NextRequest) {
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

/** PUT /api/cms/registry — update full registry */
export async function PUT(request: NextRequest) {
  const registry = await request.json() as Registry;
  await saveRegistry(registry);
  return NextResponse.json({ ok: true });
}
