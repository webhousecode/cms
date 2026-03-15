import { NextRequest, NextResponse } from "next/server";
import { getMediaAdapter } from "@/lib/media";

type Ctx = { params: Promise<{ path: string[] }> };

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { path: segments } = await params;
    const adapter = await getMediaAdapter();
    const name = segments[segments.length - 1];
    const folder = segments.length > 1 ? segments.slice(0, -1).join("/") : "";
    await adapter.deleteFile(folder, name);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if ((err as Error).message === "Path traversal detected")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
