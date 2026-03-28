import { NextRequest, NextResponse } from "next/server";
import { deleteBackup, getBackupFilePath, restoreBackup } from "@/lib/backup-service";
import { createReadStream, statSync } from "node:fs";
import { denyViewers } from "@/lib/require-role";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/admin/backups/[id] — download backup zip */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const filePath = await getBackupFilePath(id);
  if (!filePath) {
    return NextResponse.json({ error: "Backup not found" }, { status: 404 });
  }

  const stat = statSync(filePath);
  const stream = createReadStream(filePath);

  // @ts-expect-error ReadStream is valid for Response body in Node
  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${id}.zip"`,
      "Content-Length": String(stat.size),
    },
  });
}

/** POST /api/admin/backups/[id] — restore from this backup */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const denied = await denyViewers(); if (denied) return denied;
  const { id } = await ctx.params;
  const result = await restoreBackup(id);
  if (result.error) {
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json(result);
}

/** DELETE /api/admin/backups/[id] — delete this backup */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const denied = await denyViewers(); if (denied) return denied;
  const { id } = await ctx.params;
  const deleted = await deleteBackup(id);
  if (!deleted) {
    return NextResponse.json({ error: "Backup not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
