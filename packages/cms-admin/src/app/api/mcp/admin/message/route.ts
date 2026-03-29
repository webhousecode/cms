import { type NextRequest, NextResponse } from "next/server";
import { getTransportSession } from "@webhouse/cms-mcp-client";
import { resolveApiKeyToSite } from "@/lib/mcp-config";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Validate API key (site-scoped — same key that opened the SSE session)
  const resolved = await resolveApiKeyToSite(request.headers.get("authorization"));
  if (!resolved) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId query parameter" }, { status: 400 });
  }

  const transport = getTransportSession(sessionId);
  if (!transport) {
    return NextResponse.json({ error: "Session not found or expired" }, { status: 404 });
  }

  const body = await request.json() as unknown;
  transport.handleClientMessage(body);
  return new Response(null, { status: 202 });
}
