import { requirePermission } from "@/lib/permissions";
import { NextResponse } from "next/server";
import { listRevisions } from "@/lib/revisions";

type Ctx = { params: Promise<{ collection: string; slug: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  // Same gap as the trash listing: no check of any kind. A revision is what the
  // page said BEFORE — including text someone wrote and took back.
  const denied = await requirePermission("content.history"); if (denied) return denied;
  try {
    const { collection, slug } = await params;
    const revisions = await listRevisions(collection, slug);
    return NextResponse.json(revisions);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
