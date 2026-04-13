import { NextRequest, NextResponse } from "next/server";
import { getActiveSitePaths } from "@/lib/site-paths";
import { FormService } from "@/lib/forms/service";
import { getSiteRole } from "@/lib/require-role";

/** GET /api/admin/forms/[name]/submissions — list submissions. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const role = await getSiteRole();
  if (!role) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { name } = await params;
  const status = req.nextUrl.searchParams.get("status") as "new" | "read" | "archived" | null;
  const { dataDir } = await getActiveSitePaths();
  const svc = new FormService(dataDir);
  const submissions = await svc.list(name, status ? { status } : undefined);
  return NextResponse.json({ submissions });
}
