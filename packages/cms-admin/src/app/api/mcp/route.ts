import { type NextRequest, NextResponse } from "next/server";
import { createPublicMcpServer, NextSSETransport, registerTransportSession, checkRateLimit } from "@webhouse/cms-mcp-client";
import { getAdminCms, getAdminConfig } from "@/lib/cms";

// SSE requires long-lived connections — cannot be statically cached
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Rate limit by IP
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return NextResponse.json({ error: limit.reason }, { status: 429 });
  }

  const cms = await getAdminCms();
  const config = await getAdminConfig();
  const server = createPublicMcpServer(cms.content, config);

  const sessionId = crypto.randomUUID();
  const origin = request.headers.get("origin") ?? request.nextUrl.origin;
  const messageUrl = `${origin}/api/mcp/message?sessionId=${sessionId}`;
  const transport = new NextSSETransport(sessionId, messageUrl);
  registerTransportSession(transport);

  await server.connect(transport);

  return new Response(transport.stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      "X-MCP-Session-Id": sessionId,
    },
  });
}
