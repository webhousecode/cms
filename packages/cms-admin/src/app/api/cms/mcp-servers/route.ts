import { NextRequest, NextResponse } from "next/server";
import { listMcpServers, addMcpServer, updateMcpServer, deleteMcpServer } from "@/lib/mcp-servers";
import { requirePermission } from "@/lib/permissions";
import { requireInstanceAdmin } from "@/lib/instance-admin";
import { getServerTSafe } from "@/i18n/server";

/**
 * Security W41 NY-K4 — an MCP server entry is a COMMAND the server spawns
 * (with its whole environment) when an agent or AI generation runs. Any
 * editor could add one, which made "editor" a shell on the server; GET handed
 * every server's env secrets to any session. Writing is now the instance
 * admin's; reading needs settings.edit on the site.
 */
export async function GET() {
  const denied = await requirePermission("settings.edit"); if (denied) return denied;
  const servers = await listMcpServers();
  return NextResponse.json({ servers });
}

export async function POST(request: NextRequest) {
  const denied = await requireInstanceAdmin(); if (denied) return denied;
  const body = await request.json();
  const server = await addMcpServer({
    name: body.name ?? "Unnamed",
    command: body.command ?? "npx",
    args: body.args ?? [],
    env: body.env ?? {},
    enabled: body.enabled ?? true,
  });
  return NextResponse.json(server, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const t = await getServerTSafe();
  const denied = await requireInstanceAdmin(); if (denied) return denied;
  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: t("errCms.shared.idRequired") }, { status: 400 });
  const server = await updateMcpServer(body.id, body);
  return NextResponse.json(server);
}

export async function DELETE(request: NextRequest) {
  const t = await getServerTSafe();
  const denied = await requireInstanceAdmin(); if (denied) return denied;
  const { id } = (await request.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: t("errCms.shared.idRequired") }, { status: 400 });
  await deleteMcpServer(id);
  return NextResponse.json({ ok: true });
}
