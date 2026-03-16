import { NextRequest, NextResponse } from "next/server";
import { loadRegistry, saveRegistry, findSite } from "@/lib/site-registry";
import { sendTestPing, readRevalidationLog } from "@/lib/revalidation";
import { cookies } from "next/headers";

/**
 * GET /api/cms/revalidation — get revalidation settings + recent log for active site
 */
export async function GET() {
  const site = await getActiveSite();
  if (!site) return NextResponse.json({ error: "No active site" }, { status: 404 });

  const log = await readRevalidationLog();

  return NextResponse.json({
    revalidateUrl: site.revalidateUrl ?? "",
    revalidateSecret: site.revalidateSecret ?? "",
    log,
  });
}

/**
 * POST /api/cms/revalidation — update revalidation settings for active site
 */
export async function POST(request: NextRequest) {
  const body = await request.json() as {
    action?: "test-ping" | "save";
    revalidateUrl?: string;
    revalidateSecret?: string;
  };

  const registry = await loadRegistry();
  if (!registry) return NextResponse.json({ error: "No registry" }, { status: 400 });

  const cookieStore = await cookies();
  const orgId = cookieStore.get("cms-active-org")?.value ?? registry.defaultOrgId;
  const siteId = cookieStore.get("cms-active-site")?.value ?? registry.defaultSiteId;
  const site = findSite(registry, orgId, siteId);
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  if (body.action === "test-ping") {
    const result = await sendTestPing(site);
    return NextResponse.json(result);
  }

  // Save revalidation settings
  if (body.revalidateUrl !== undefined) site.revalidateUrl = body.revalidateUrl || undefined;
  if (body.revalidateSecret !== undefined) site.revalidateSecret = body.revalidateSecret || undefined;

  await saveRegistry(registry);
  return NextResponse.json({ ok: true, revalidateUrl: site.revalidateUrl ?? "", revalidateSecret: site.revalidateSecret ?? "" });
}

// ─── Helper ─────────────────────────────────────────────

async function getActiveSite() {
  const registry = await loadRegistry();
  if (!registry) return null;
  const cookieStore = await cookies();
  const orgId = cookieStore.get("cms-active-org")?.value ?? registry.defaultOrgId;
  const siteId = cookieStore.get("cms-active-site")?.value ?? registry.defaultSiteId;
  return findSite(registry, orgId, siteId);
}
