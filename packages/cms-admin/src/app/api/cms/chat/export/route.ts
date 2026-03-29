import { NextResponse } from "next/server";
import { getSessionWithSiteRole } from "@/lib/require-role";
import { buildExportZip } from "@/lib/chat/chat-export";
import { readSiteConfig } from "@/lib/site-config";
import { loadRegistry, findSite } from "@/lib/site-registry";
import { cookies } from "next/headers";

/** GET /api/cms/chat/export — download full chat export as ZIP */
export async function GET() {
  const session = await getSessionWithSiteRole();
  if (!session) return NextResponse.json({ error: "No access" }, { status: 403 });

  // Resolve site name
  let siteName = "webhouse-site";
  try {
    const registry = await loadRegistry();
    if (registry) {
      const cookieStore = await cookies();
      const orgId = cookieStore.get("cms-active-org")?.value ?? registry.defaultOrgId;
      const siteId = cookieStore.get("cms-active-site")?.value ?? registry.defaultSiteId;
      const site = findSite(registry, orgId, siteId);
      if (site) siteName = site.name.toLowerCase().replace(/\s+/g, "-");
    }
  } catch { /* fallback */ }

  const zipBuffer = await buildExportZip(session.userId, siteName);
  const date = new Date().toISOString().split("T")[0];

  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="webhouse-chat-export-${siteName}-${date}.zip"`,
    },
  });
}
