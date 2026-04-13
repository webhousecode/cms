import { NextRequest, NextResponse } from "next/server";
import { getActiveSitePaths } from "@/lib/site-paths";
import { FormService } from "@/lib/forms/service";
import { getSiteRole } from "@/lib/require-role";

/** GET /api/admin/forms/[name]/export — CSV export of all submissions. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const role = await getSiteRole();
  if (!role) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { name } = await params;
  const { dataDir } = await getActiveSitePaths();
  const svc = new FormService(dataDir);
  const csv = await svc.exportCsv(name);
  if (!csv) return NextResponse.json({ error: "No submissions" }, { status: 404 });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-submissions.csv"`,
    },
  });
}
