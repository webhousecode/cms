import { NextRequest, NextResponse } from "next/server";
import { getActiveSitePaths } from "@/lib/site-paths";
import { FormService } from "@/lib/forms/service";
import { getAllForms, upsertAdminForm } from "@/lib/forms/store";
import { denyViewers } from "@/lib/require-role";

/** GET /api/admin/forms — list ALL forms (config + admin) + unread counts. */
export async function GET() {
  const allForms = await getAllForms();
  const { dataDir } = await getActiveSitePaths();
  const svc = new FormService(dataDir);
  const counts = await svc.unreadCounts();

  const forms = allForms.map((f) => ({
    name: f.name,
    label: f.label,
    fieldCount: f.fields.length,
    unread: counts[f.name] ?? 0,
    source: f._source ?? "config",
    hasAutoReply: !!f.autoReply?.enabled,
  }));

  return NextResponse.json({ forms });
}

/** POST /api/admin/forms — create or update an admin-defined form. */
export async function POST(req: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!body.name || !body.label || !Array.isArray(body.fields)) {
    return NextResponse.json({ error: "name, label, and fields are required" }, { status: 400 });
  }
  try {
    await upsertAdminForm(body as unknown as Parameters<typeof upsertAdminForm>[0]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
