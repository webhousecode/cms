import { NextRequest, NextResponse } from "next/server";
import { getActiveSitePaths } from "@/lib/site-paths";
import { FormService } from "@/lib/forms/service";
import { denyViewers } from "@/lib/require-role";

/** GET — single submission. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string; id: string }> }) {
  const { name, id } = await params;
  const { dataDir } = await getActiveSitePaths();
  const svc = new FormService(dataDir);
  const sub = await svc.get(name, id);
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(sub);
}

/** PATCH — update status (new → read → archived). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ name: string; id: string }> }) {
  const denied = await denyViewers(); if (denied) return denied;
  const { name, id } = await params;
  const body = (await req.json().catch(() => ({}))) as { status?: string };
  if (!body.status || !["new", "read", "archived"].includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const { dataDir } = await getActiveSitePaths();
  const svc = new FormService(dataDir);
  try {
    const sub = await svc.updateStatus(name, id, body.status as "new" | "read" | "archived");
    return NextResponse.json(sub);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

/** DELETE — remove a submission permanently. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ name: string; id: string }> }) {
  const denied = await denyViewers(); if (denied) return denied;
  const { name, id } = await params;
  const { dataDir } = await getActiveSitePaths();
  const svc = new FormService(dataDir);
  try {
    await svc.delete(name, id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
