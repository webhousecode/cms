import { NextRequest, NextResponse } from "next/server";
import { rejectQueueItem } from "@/lib/curation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { feedback } = (await request.json()) as { feedback?: string };
    if (!feedback) {
      return NextResponse.json({ error: "feedback required" }, { status: 400 });
    }
    const item = await rejectQueueItem(id, feedback);
    return NextResponse.json(item);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to reject";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
