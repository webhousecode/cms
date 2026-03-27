import { NextResponse } from "next/server";
import { getActiveSitePaths } from "@/lib/site-paths";
import { existsSync } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "path";

const execAsync = promisify(exec);

/**
 * POST /api/preview-build
 *
 * Runs `npx tsx build.ts` in the active site's project directory.
 * Returns build output or error.
 */
export async function POST() {
  const sitePaths = await getActiveSitePaths();
  const projectDir = sitePaths.projectDir;

  const buildFile = path.join(projectDir, "build.ts");
  if (!existsSync(buildFile)) {
    return NextResponse.json(
      { error: "No build.ts found in project directory." },
      { status: 404 },
    );
  }

  try {
    const { stdout, stderr } = await execAsync("npx tsx build.ts", {
      cwd: projectDir,
      timeout: 30000,
      env: { ...process.env, NODE_ENV: "production", BASE_PATH: "", INCLUDE_DRAFTS: "true" },
    });

    return NextResponse.json({
      ok: true,
      output: stdout,
      warnings: stderr || undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? (err as Error & { stderr?: string }).stderr || err.message : "Build failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
