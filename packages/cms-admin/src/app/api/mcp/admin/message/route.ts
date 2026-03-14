import { type NextRequest, NextResponse } from "next/server";
import { getTransportSession } from "@webhouse/cms-mcp-client";
import { validateApiKey } from "@webhouse/cms-mcp-server";
import { getMcpApiKeys } from "@/lib/mcp-config";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const keys = await getMcpApiKeys();
  const auth = validateApiKey(request.headers.get("authorization"), keys);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
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
