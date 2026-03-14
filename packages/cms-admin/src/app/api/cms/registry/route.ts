import { NextRequest, NextResponse } from "next/server";
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
    action: "bootstrap" | "add-org" | "add-site";
    orgName?: string;
    orgId?: string;
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
    const org = await addOrg(body.orgName);
    return NextResponse.json({ ok: true, org });
  }

  if (body.action === "add-site") {
    if (!body.orgId || !body.site) {
      return NextResponse.json({ error: "orgId and site required" }, { status: 400 });
    }
    await addSite(body.orgId, body.site);
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
