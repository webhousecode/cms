/**
 * GET /api/admin/deploy/events?site=<siteId>
 *
 * Server-Sent Events (SSE) stream of deploy events for the active site.
 * Admin UI opens this on mount and gets pushed page_build status as the
 * webhook lands — replaces the polling loop in admin-header.
 *
 * Stream format: standard SSE
 *   event: page-build
 *   data: { "type":"page-build", "status":"built", "url":"...", ... }
 *
 * Plus a heartbeat ":\n\n" every 30s so proxies don't close idle.
 *
 * Auth: same site role as other /api/admin/* routes.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSiteRole } from "@/lib/require-role";
import { loadRegistry, findSite } from "@/lib/site-registry";
import { subscribe, type DeployEvent } from "@/lib/deploy/deploy-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  const siteId = req.nextUrl.searchParams.get("site");
  if (!siteId) {
    return NextResponse.json({ error: "site query param required" }, { status: 400 });
  }
  const ctx = await resolveOrgForSite(siteId);
  if (!ctx) {
    return NextResponse.json({ error: `site not found: ${siteId}` }, { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      function send(event: DeployEvent): void {
        const data = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
        try { controller.enqueue(encoder.encode(data)); }
        catch { /* connection closed — unsubscribe handles cleanup */ }
      }

      // Initial open frame — tells client SSE is live
      controller.enqueue(encoder.encode(`event: open\ndata: {"site":"${siteId}"}\n\n`));

      const unsub = subscribe(ctx.orgId, ctx.siteId, send);

      // Heartbeat every 30s. Closes when client disconnects (controller throws).
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(":heartbeat\n\n")); }
        catch { clearInterval(heartbeat); unsub(); }
      }, 30_000);

      // Tear down when client disconnects.
      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsub();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable nginx/proxy buffering
      "X-Accel-Buffering": "no",
    },
  });
}
