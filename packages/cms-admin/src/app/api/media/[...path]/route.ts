import { NextRequest, NextResponse } from "next/server";
import { getMediaAdapter } from "@/lib/media";
import { denyViewers } from "@/lib/require-role";

type Ctx = { params: Promise<{ path: string[] }> };

/** DELETE: move to trash (soft delete) */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const denied = await denyViewers(); if (denied) return denied;
  try {
    const { path: segments } = await params;
    const adapter = await getMediaAdapter();
    const name = segments[segments.length - 1];
    const folder = segments.length > 1 ? segments.slice(0, -1).join("/") : "";

    const permanent = req.nextUrl.searchParams.get("permanent") === "true";
    if (permanent) {
      await adapter.deleteFile(folder, name);
    } else {
      await adapter.trashFile(folder, name);
    }
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return NextResponse.json({ error: "Not found" }, { status: 404 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
