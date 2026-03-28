import { NextRequest, NextResponse } from "next/server";
import { listMcpServers, addMcpServer, updateMcpServer, deleteMcpServer } from "@/lib/mcp-servers";
import { denyViewers } from "@/lib/require-role";

export async function GET() {
  const servers = await listMcpServers();
  return NextResponse.json({ servers });
}

export async function POST(request: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
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
  const denied = await denyViewers(); if (denied) return denied;
  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const server = await updateMcpServer(body.id, body);
  return NextResponse.json(server);
}

export async function DELETE(request: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  const { id } = (await request.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteMcpServer(id);
  return NextResponse.json({ ok: true });
}
