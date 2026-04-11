import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { createBackupProvider } from "@/lib/backup/providers";
import type { BackupProviderConfig } from "@/lib/backup/providers/types";

/** POST /api/admin/backup-test — test cloud backup provider connection */
export async function POST(req: NextRequest) {
  const denied = await requirePermission("backup.manage");
  if (denied) return denied;

  try {
    const body = (await req.json()) as BackupProviderConfig;
    if (!body.type || body.type === "off") {
      return NextResponse.json({ ok: false, message: "No provider configured" });
    }

    const provider = await createBackupProvider(body);
    const result = await provider.test();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Test failed" },
      { status: 500 },
    );
  }
}
