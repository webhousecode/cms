/**
 * Chat Sync — SSE endpoint for real-time cross-device chat synchronization.
 *
 * GET  /api/cms/chat/sync — open persistent SSE connection, receive sync events
 * POST /api/cms/chat/sync — broadcast a sync event to all connected clients
 *
 * Events:
 *   conversation-saved  { conversationId, updatedAt }
 *   conversation-deleted { conversationId }
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionWithSiteRole } from "@/lib/require-role";

interface SyncClient {
  controller: ReadableStreamDefaultController;
  userId: string;
  connectedAt: number;
}

// Global client pool (survives HMR in dev via globalThis)
const g = globalThis as any;
if (!g.__chatSyncClients) g.__chatSyncClients = new Set<SyncClient>();
const clients: Set<SyncClient> = g.__chatSyncClients;

function broadcast(event: string, data: unknown, excludeUserId?: string) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const encoder = new TextEncoder();
  const encoded = encoder.encode(payload);
  for (const client of clients) {
    if (excludeUserId && client.userId === excludeUserId) continue;
    try {
      client.controller.enqueue(encoded);
    } catch {
      clients.delete(client);
    }
  }
}

/** GET — open SSE connection */
export async function GET() {
  const session = await getSessionWithSiteRole();
  if (!session) return NextResponse.json({ error: "No access" }, { status: 403 });

  const encoder = new TextEncoder();
  let client: SyncClient;

  const stream = new ReadableStream({
    start(controller) {
      client = { controller, userId: session.userId, connectedAt: Date.now() };
      clients.add(client);

      // Send initial ping
      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ clients: clients.size })}\n\n`));
    },
    cancel() {
      clients.delete(client);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/** POST — broadcast a sync event */
export async function POST(request: NextRequest) {
  const session = await getSessionWithSiteRole();
  if (!session) return NextResponse.json({ error: "No access" }, { status: 403 });

  const { event, data } = await request.json() as { event: string; data: unknown };
  if (!event) return NextResponse.json({ error: "event required" }, { status: 400 });

  broadcast(event, data);
  return NextResponse.json({ ok: true, clients: clients.size });
}
