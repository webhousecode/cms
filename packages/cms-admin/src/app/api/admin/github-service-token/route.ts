import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getTeamMember } from "@/lib/team";
import { getActiveSitePaths } from "@/lib/site-paths";
import fs from "fs/promises";
import path from "path";

/**
 * POST /api/admin/github-service-token
 * Saves the current admin's GitHub OAuth token as the site service token.
 * This allows editors without GitHub accounts to access GitHub-backed sites.
 */
export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const member = await getTeamMember(session.sub);
  if (!member || member.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const githubToken = cookieStore.get("github-token")?.value;
  if (!githubToken) {
    return NextResponse.json({ error: "No GitHub token — connect GitHub first" }, { status: 400 });
  }

  const { dataDir } = await getActiveSitePaths();
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(
    path.join(dataDir, "github-service-token.json"),
    JSON.stringify({ token: githubToken, updatedAt: new Date().toISOString() }),
  );

  return NextResponse.json({ ok: true });
}
