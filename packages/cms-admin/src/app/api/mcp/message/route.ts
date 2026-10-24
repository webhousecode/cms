/* i18n-ignore-file: MCP protocol endpoint — tool results, errors and server info are returned to an AI client, not shown to a person */
import { type NextRequest, NextResponse } from "next/server";
import { readJsonLimited, MCP_MAX_BODY_BYTES, MCP_JSON_SHAPE_LIMITS } from "@/lib/read-json-limited";
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

  const body = await readJsonLimited(request, MCP_MAX_BODY_BYTES, MCP_JSON_SHAPE_LIMITS);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  transport.handleClientMessage(body.value);
  return new Response(null, { status: 202 });
}
