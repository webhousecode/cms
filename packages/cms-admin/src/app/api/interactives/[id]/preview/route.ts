import { NextRequest, NextResponse } from "next/server";
import { getMediaAdapter } from "@/lib/media";

/* ─── GET: serve HTML for iframe preview ─────────────────────── */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const adapter = await getMediaAdapter();
    const result = await adapter.getInteractive(id);
    if (!result) return new NextResponse("Not found", { status: 404 });

    return new NextResponse(result.content, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[interactives] preview error:", err);
    return new NextResponse(`Internal error: ${(err as Error).message}`, { status: 500 });
  }
}
