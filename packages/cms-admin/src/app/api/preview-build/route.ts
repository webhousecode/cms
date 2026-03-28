import { NextResponse } from "next/server";
import { getActiveSitePaths } from "@/lib/site-paths";
import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { existsSync } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "path";
import { denyViewers } from "@/lib/require-role";

const execAsync = promisify(exec);

/**
 * POST /api/preview-build
 *
 * Builds the active site for preview. Includes drafts.
 * Strategy:
 * 1. If project has build.ts → run it with INCLUDE_DRAFTS=true
 * 2. Otherwise → use runBuild() from @webhouse/cms directly
 */
export async function POST() {
  const denied = await denyViewers(); if (denied) return denied;
  const sitePaths = await getActiveSitePaths();
  const projectDir = sitePaths.projectDir;

  // Strategy 1: custom build.ts
  const buildFile = path.join(projectDir, "build.ts");
  if (existsSync(buildFile)) {
    try {
      const { stdout, stderr } = await execAsync("npx tsx build.ts", {
        cwd: projectDir,
        timeout: 30000,
        env: { ...process.env, NODE_ENV: "production", BASE_PATH: "", INCLUDE_DRAFTS: "true" },
      });
      return NextResponse.json({ ok: true, output: stdout, warnings: stderr || undefined });
    } catch (err) {
      const msg = err instanceof Error ? (err as Error & { stderr?: string }).stderr || err.message : "Build failed";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // Strategy 2: use CMS runBuild directly
  try {
    const { runBuild } = await import("@webhouse/cms");
    const cms = await getAdminCms();
    const config = await getAdminConfig();

    const distDir = path.join(projectDir, "dist");
    const result = await runBuild(config, cms.storage, {
      outDir: distDir,
      includeDrafts: true,
    });

    return NextResponse.json({ ok: true, output: `Built ${result.pages} pages to ${distDir}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Build failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
