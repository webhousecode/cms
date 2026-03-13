import { type NextRequest, NextResponse } from "next/server";
import { getTransportSession, checkRateLimit } from "@webhouse/cms-mcp-client";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return NextResponse.json({ error: limit.reason }, { status: 429 });
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
