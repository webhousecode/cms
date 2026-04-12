/**
 * F126 — Check if the active site has a custom build.command configured.
 *
 * GET /api/admin/site-config/build-command
 * Returns { hasBuildCommand: boolean, command?: string }
 */
import { NextResponse } from "next/server";
import { getAdminConfig } from "@/lib/cms";

export async function GET() {
  try {
    const config = await getAdminConfig();
    const command = config.build?.command;
    return NextResponse.json({
      hasBuildCommand: !!command,
      command: command ?? null,
    });
  } catch {
    return NextResponse.json({ hasBuildCommand: false, command: null });
  }
}
