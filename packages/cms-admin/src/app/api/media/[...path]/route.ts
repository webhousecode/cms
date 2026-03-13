import { NextResponse } from "next/server";
import { unlink } from "fs/promises";
import { safeUploadPath } from "@/lib/upload-dir";

type Ctx = { params: Promise<{ path: string[] }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { path: segments } = await params;
    const filePath = safeUploadPath(segments);
    await unlink(filePath);
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
