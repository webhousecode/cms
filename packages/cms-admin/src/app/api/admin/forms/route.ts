import { NextResponse } from "next/server";
import { getAdminConfig } from "@/lib/cms";
import { getActiveSitePaths } from "@/lib/site-paths";
import { FormService } from "@/lib/forms/service";

/** GET /api/admin/forms — list configured forms + unread counts. */
export async function GET() {
  const config = await getAdminConfig();
  const { dataDir } = await getActiveSitePaths();
  const svc = new FormService(dataDir);
  const counts = await svc.unreadCounts();

  const forms = (config.forms ?? []).map((f) => ({
    name: f.name,
    label: f.label,
    fieldCount: f.fields.length,
    unread: counts[f.name] ?? 0,
  }));

  return NextResponse.json({ forms });
}
