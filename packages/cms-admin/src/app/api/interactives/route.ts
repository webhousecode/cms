import { NextRequest, NextResponse } from "next/server";
import { getMediaAdapter } from "@/lib/media";

/* ─── GET: list all interactives ─────────────────────────────── */
export async function GET() {
  try {
    const adapter = await getMediaAdapter();
    const meta = await adapter.listInteractives();
    return NextResponse.json(meta);
  } catch (err) {
    console.error("[interactives] list error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* ─── POST: upload new interactive ───────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const adapter = await getMediaAdapter();
    const entry = await adapter.createInteractive(file.name, buffer);

    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    console.error("[interactives] upload error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
