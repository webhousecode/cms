import { NextRequest, NextResponse } from "next/server";
import { getActiveSitePaths } from "@/lib/site-paths";
import { FormService } from "@/lib/forms/service";
import { requirePermission } from "@/lib/permissions";

/** GET /api/admin/forms/[name]/submissions — list submissions. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  // The list already carries personal data — name/email, subject, and the first
  // 80 chars of every message — so it is not "metadata" that can sit behind a
  // looser check than the single-submission read.
  const denied = await requirePermission("forms.read"); if (denied) return denied;
  const { name } = await params;
  const status = req.nextUrl.searchParams.get("status") as "new" | "read" | "archived" | null;
  const { dataDir } = await getActiveSitePaths();
  const svc = new FormService(dataDir);
  const submissions = await svc.list(name, status ? { status } : undefined);
  return NextResponse.json({ submissions });
}
