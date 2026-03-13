import { type NextRequest, NextResponse } from "next/server";
import { getTransportSession } from "@webhouse/cms-mcp-client";
import { validateApiKey } from "@webhouse/cms-mcp-server";

export const dynamic = "force-dynamic";

function getApiKeyConfigs() {
  const keys = [];
  for (let i = 1; i <= 5; i++) {
    const key = process.env[`MCP_API_KEY_${i}`];
    const label = process.env[`MCP_API_KEY_${i}_LABEL`] ?? `Key ${i}`;
    const scopes = (process.env[`MCP_API_KEY_${i}_SCOPES`] ?? "read,write,publish,deploy,ai").split(",").map(s => s.trim());
    if (key) keys.push({ key, label, scopes });
  }
  const single = process.env.MCP_API_KEY;
  if (single && keys.length === 0) {
    keys.push({ key: single, label: "Default", scopes: ["read", "write", "publish", "deploy", "ai"] });
  }
  return keys;
}

export async function POST(request: NextRequest) {
  const keys = getApiKeyConfigs();
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
