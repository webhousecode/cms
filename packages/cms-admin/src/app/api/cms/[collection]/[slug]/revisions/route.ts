import { requirePermission } from "@/lib/permissions";
import { NextResponse } from "next/server";
import { listRevisions } from "@/lib/revisions";
import { getServerTSafe } from "@/i18n/server";

type Ctx = { params: Promise<{ collection: string; slug: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const t = await getServerTSafe();
  // Same gap as the trash listing: no check of any kind. A revision is what the
  // page said BEFORE — including text someone wrote and took back.
  const denied = await requirePermission("content.history"); if (denied) return denied;
  try {
    const { collection, slug } = await params;
    const revisions = await listRevisions(collection, slug);
    return NextResponse.json(revisions);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: t("errCms.shared.internalError") }, { status: 500 });
  }
}
