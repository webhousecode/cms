/**
 * F126 — Check if the active site has custom build configured.
 *
 * GET /api/admin/site-config/build-command
 * Returns { hasBuildCommand, command, profiles[] }
 */
import { NextResponse } from "next/server";
import { getAdminConfig } from "@/lib/cms";
import { listProfiles, resolveProfile } from "@/lib/build/resolve-profile";

export async function GET() {
  try {
    const config = await getAdminConfig();
    const resolved = resolveProfile(config.build);
    const profiles = listProfiles(config.build);
    return NextResponse.json({
      hasBuildCommand: !!resolved,
      command: resolved?.command ?? null,
      profiles,
    });
  } catch {
    return NextResponse.json({
      hasBuildCommand: false,
      command: null,
      profiles: [],
    });
  }
}
