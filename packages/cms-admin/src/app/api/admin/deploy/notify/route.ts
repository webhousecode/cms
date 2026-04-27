/**
 * POST /api/admin/deploy/notify
 *
 * Webhook endpoint called by GitHub Actions (or any CI) when a deploy
 * completes. Broadcasts a deploy-done SSE event to all connected admin
 * clients so they can show a toast without polling.
 *
 * Authentication: Bearer token must match DEPLOY_NOTIFY_SECRET env var
 * (or CMS_CRON_SECRET as fallback). GitHub Actions stores this as a
 * repository secret and sends it in the Authorization header.
 *
 * Body: { status: "success" | "failure", url?: string, app?: string, duration?: number }
 */
import { NextRequest, NextResponse } from "next/server";

// Re-use the same global SSE client pool as chat/sync so events reach all tabs.
const g = globalThis as Record<string, unknown>;
if (!g.__deployNotifyClients) g.__deployNotifyClients = new Set<ReadableStreamDefaultController>();
const clients = g.__deployNotifyClients as Set<ReadableStreamDefaultController>;

export function broadcast(payload: object) {
  const encoded = new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
  for (const ctrl of clients) {
    try { ctrl.enqueue(encoded); } catch { clients.delete(ctrl); }
  }
}

/** GET — open SSE connection to receive deploy-done events */
export async function GET() {
  let ctrl: ReadableStreamDefaultController;
  const stream = new ReadableStream({
    start(c) {
      ctrl = c;
      clients.add(ctrl);
      ctrl.enqueue(new TextEncoder().encode(`: connected\n\n`));
    },
    cancel() { clients.delete(ctrl); },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/** POST — receive deploy-done webhook from GitHub Actions */
export async function POST(request: NextRequest) {
  const secret = process.env.DEPLOY_NOTIFY_SECRET || process.env.CMS_CRON_SECRET;

  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
    if (token !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await request.json().catch(() => ({})) as {
    status?: string;
    url?: string;
    app?: string;
    duration?: number;
  };

  broadcast({
    event: "deploy-done",
    status: body.status ?? "success",
    url: body.url,
    app: body.app,
    duration: body.duration,
    ts: Date.now(),
  });

  return NextResponse.json({ ok: true, clients: clients.size });
}
