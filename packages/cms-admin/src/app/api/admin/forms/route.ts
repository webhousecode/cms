import { NextRequest, NextResponse } from "next/server";
import { getActiveSitePaths } from "@/lib/site-paths";
import { FormService } from "@/lib/forms/service";
import { getAllForms, upsertAdminForm } from "@/lib/forms/store";
import { requirePermission } from "@/lib/permissions";
import { requireCapability } from "@/lib/capabilities";

/** GET /api/admin/forms — list ALL forms (config + admin) + unread counts. */
export async function GET() {
  // The `unread` field below is a count of visitors' submissions per form —
  // the same figure I declined to hand a viewer in the chat (`form_stats`) on
  // the grounds that a count is worthless to someone who may open none of
  // them. Leaving it reachable here would have made that decision incoherent:
  // refused in one surface, served every 30 seconds in another.
  const denied = await requirePermission("forms.read"); if (denied) return denied;
  const capDenied = await requireCapability("forms"); if (capDenied) return capDenied;
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
  const denied = await requirePermission("forms.manage"); if (denied) return denied;
  const capDenied = await requireCapability("forms"); if (capDenied) return capDenied;
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
