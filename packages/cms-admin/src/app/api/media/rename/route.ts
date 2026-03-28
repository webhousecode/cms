import { NextRequest, NextResponse } from "next/server";
import { getMediaAdapter } from "@/lib/media";
import { denyViewers } from "@/lib/require-role";

/**
 * POST /api/media/rename
 * Body: { folder: string, oldName: string, newName: string }
 * Returns: { url: string } — the new browser-renderable URL
 */
export async function POST(req: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  try {
    const { folder, oldName, newName } = (await req.json()) as {
      folder: string;
      oldName: string;
      newName: string;
    };

    if (!oldName || !newName) {
      return NextResponse.json({ error: "oldName and newName are required" }, { status: 400 });
    }

    if (oldName === newName) {
      return NextResponse.json({ error: "Names are identical" }, { status: 400 });
    }

    // Sanitize new name: keep extension, sanitize base
    const sanitized = newName.replace(/[^a-zA-Z0-9._-]/g, "-");
    if (!sanitized || sanitized === "." || sanitized === "..") {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    const adapter = await getMediaAdapter();
    const result = await adapter.renameFile(folder ?? "", oldName, sanitized);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return NextResponse.json({ error: "File not found" }, { status: 404 });
    console.error("[media/rename] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
