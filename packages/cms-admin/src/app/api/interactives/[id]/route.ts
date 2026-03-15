import { NextRequest, NextResponse } from "next/server";
import { getMediaAdapter } from "@/lib/media";

/* ─── GET: get interactive metadata + content ────────────────── */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const adapter = await getMediaAdapter();
    const result = await adapter.getInteractive(id);
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ...result.meta, content: result.content });
  } catch (err) {
    console.error("[interactives] get error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* ─── PUT: update interactive content ────────────────────────── */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const adapter = await getMediaAdapter();
    const updated = await adapter.updateInteractive(id, {
      content: body.content,
      name: body.name,
      status: body.status,
    });
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[interactives] update error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* ─── DELETE: remove interactive ─────────────────────────────── */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const adapter = await getMediaAdapter();
    const ok = await adapter.deleteInteractive(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[interactives] delete error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
