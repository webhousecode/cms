import { NextRequest, NextResponse } from "next/server";
import { getQueueItem, approveQueueItem, rejectQueueItem } from "@/lib/curation";
import { getAdminCms } from "@/lib/cms";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const item = await getQueueItem(id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { action, feedback } = (await request.json()) as {
    action: "approve" | "reject";
    feedback?: string;
  };

  const item = await getQueueItem(id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "reject") {
    const updated = await rejectQueueItem(id, feedback ?? "");
    return NextResponse.json(updated);
  }

  if (action === "approve") {
    // Approve → mark approved
    const updated = await approveQueueItem(id);

    // Then actually create the CMS document
    try {
      const cms = await getAdminCms();
      await cms.content.create(item.collection, {
        slug: item.slug,
        status: "draft",
        data: item.contentData,
      });
    } catch (err) {
      // Non-fatal: item is approved in queue even if CMS write fails
      console.error("[curation] CMS create failed:", err);
    }

    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
