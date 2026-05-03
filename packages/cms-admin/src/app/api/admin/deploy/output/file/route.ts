/**
 * Deploy output browser — read a single file's bytes.
 *
 * GET /api/admin/deploy/output/file?path=<rel>&site=<id>
 *   - returns the file bytes with proper Content-Type
 *   - 404 if not found, 400 if path escapes deploy root
 *
 * Used for in-browser preview (HTML in iframe, images inline).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSiteRole } from "@/lib/require-role";
import { withSiteContext } from "@/lib/site-context";
import { loadRegistry, findSite } from "@/lib/site-registry";
import { readFile } from "@/lib/deploy/output-browser";

async function resolveOrgForSite(siteId: string): Promise<{ orgId: string; siteId: string } | null> {
  const registry = await loadRegistry();
  if (!registry) return null;
  for (const org of registry.orgs) {
    if (findSite(registry, org.id, siteId)) return { orgId: org.id, siteId };
  }
  return null;
}

export async function GET(req: NextRequest): Promise<Response> {
  const role = await getSiteRole();
  if (!role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rel = req.nextUrl.searchParams.get("path");
  if (!rel) return NextResponse.json({ error: "path query param required" }, { status: 400 });

  const overrideSite = req.nextUrl.searchParams.get("site");

  const run = async (): Promise<Response> => {
    try {
      const result = await readFile(rel);
      if (!result) return NextResponse.json({ error: "file not found" }, { status: 404 });
      return new Response(new Uint8Array(result.buffer), {
        headers: {
          "Content-Type": result.mime,
          "Content-Length": String(result.sizeBytes),
          // Sandboxed preview — short cache; stats refresh after each deploy
          "Cache-Control": "private, max-age=10",
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes("escapes deploy root") ? 400 : msg.includes("too large") ? 413 : 500;
      return NextResponse.json({ error: msg }, { status });
    }
  };

  if (overrideSite) {
    const ctx = await resolveOrgForSite(overrideSite);
    if (!ctx) return NextResponse.json({ error: `site not found: ${overrideSite}` }, { status: 404 });
    return withSiteContext(ctx, run);
  }
  return run();
}
