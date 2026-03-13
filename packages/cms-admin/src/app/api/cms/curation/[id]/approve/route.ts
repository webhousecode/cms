import { NextRequest, NextResponse } from "next/server";
import { approveQueueItem } from "@/lib/curation";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const item = await approveQueueItem(id);
    return NextResponse.json(item);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to approve";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
