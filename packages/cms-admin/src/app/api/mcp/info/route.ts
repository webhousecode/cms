import { NextResponse } from "next/server";
import { PUBLIC_TOOLS } from "@webhouse/cms-mcp-client";
import { getAdminConfig } from "@/lib/cms";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = await getAdminConfig();
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  const baseUrl = `${proto}://${host}`;

  return NextResponse.json({
    name: "CMS Public MCP Server",
    description: "Read-only access to published content. No authentication required.",
    protocol: "Model Context Protocol",
    transport: "SSE",
    endpoint: `${baseUrl}/api/mcp`,
    messageEndpoint: `${baseUrl}/api/mcp/message`,
    auth: "none",
    rateLimit: "60 requests/minute per IP",
    collections: config.collections.map((c) => ({
      name: c.name,
      label: c.label ?? c.name,
      fields: c.fields.length,
    })),
    tools: PUBLIC_TOOLS.map((t) => ({ name: t.name, description: t.description })),
  });
}
