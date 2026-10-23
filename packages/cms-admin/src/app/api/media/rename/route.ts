import { NextRequest, NextResponse } from "next/server";
import { getMediaAdapter } from "@/lib/media";
import { denyViewers } from "@/lib/require-role";
import { isCodeUpload, codeUploadRefused } from "@/lib/code-path-policy";
import { getServerTSafe } from "@/i18n/server";

/**
 * POST /api/media/rename
 * Body: { folder: string, oldName: string, newName: string, replace?: boolean }
 * 409 when newName already exists (also in the trash); replace: true deletes
 * the existing target permanently first (F206.7).
 * Returns: { url: string } — the new browser-renderable URL
 */
export async function POST(req: NextRequest) {
  const t = await getServerTSafe();
  const denied = await denyViewers(); if (denied) return denied;
  try {
    const { folder, oldName, newName, replace } = (await req.json()) as {
      folder: string;
      oldName: string;
      newName: string;
      replace?: boolean;
    };

    if (!oldName || !newName) {
      return NextResponse.json({ error: t("errApi.media.renameNamesRequired") }, { status: 400 });
    }

    if (oldName === newName) {
      return NextResponse.json({ error: t("errApi.media.namesIdentical") }, { status: 400 });
    }

    // Sanitize new name: keep extension, sanitize base
    const sanitized = newName.replace(/[^a-zA-Z0-9._-]/g, "-");
    if (!sanitized || sanitized === "." || sanitized === "..") {
      return NextResponse.json({ error: t("errApi.media.invalidFilename") }, { status: 400 });
    }

    // Security W41 C5 — renaming photo.jpg to x.ts is an upload of code too.
    if (isCodeUpload(sanitized)) return NextResponse.json({ error: await codeUploadRefused() }, { status: 415 });

    const adapter = await getMediaAdapter();
    const result = await adapter.renameFile(folder ?? "", oldName, sanitized, { replace: replace === true });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return NextResponse.json({ error: t("errApi.common.fileNotFound") }, { status: 404 });
    if (code === "EBADPATH") return NextResponse.json({ error: t("errApi.common.invalidMediaPath") }, { status: 400 });
    if (code === "EEXIST") return NextResponse.json({ error: t("errApi.media.nameExists") }, { status: 409 });
    console.error("[media/rename] error:", err);
    return NextResponse.json({ error: t("errApi.common.internalError") }, { status: 500 });
  }
}
