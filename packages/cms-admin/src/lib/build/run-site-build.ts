/**
 * F126 — Run site build (custom command or native build.ts).
 *
 * Used by deploy-service to abstract whether a site uses the native
 * TypeScript build pipeline or a custom build command (Laravel, Hugo, etc.).
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { CmsConfig } from "@webhouse/cms";
import { executeBuild } from "./executor";
import { resolveWorkingDir } from "./validate-paths";
import { parseCommand } from "./allowlist";

export interface SiteBuildOptions {
  /** Absolute path to site project directory. */
  projectDir: string;
  /** CMS config (for reading build.command etc.). */
  cmsConfig: CmsConfig;
  /** Deploy output directory name (e.g. "deploy"). Overrides config outDir for deploy. */
  deployOutDir: string;
  /** BASE_PATH env var for the build. */
  basePath?: string;
}

export interface SiteBuildResult {
  /** Whether the build succeeded. */
  success: boolean;
  /** Absolute path to the build output directory. */
  outDirAbs: string;
  /** Duration in milliseconds. */
  duration: number;
  /** Whether a custom command was used (vs native build.ts). */
  usedCustomCommand: boolean;
}

/**
 * Run a site build — either via the custom `build.command` from cms.config.ts,
 * or the native `npx tsx build.ts` fallback.
 */
export async function runSiteBuild(
  opts: SiteBuildOptions,
): Promise<SiteBuildResult> {
  const { projectDir, cmsConfig, deployOutDir, basePath } = opts;
  const buildCommand = cmsConfig.build?.command;

  if (buildCommand) {
    return runCustomBuild(projectDir, cmsConfig, deployOutDir, basePath);
  }
  return runNativeBuild(projectDir, deployOutDir, basePath);
}

// ── Custom command build ────────────────────────────────────

async function runCustomBuild(
  projectDir: string,
  config: CmsConfig,
  deployOutDir: string,
  basePath?: string,
): Promise<SiteBuildResult> {
  const buildConfig = config.build!;
  const command = buildConfig.command!;

  const workingDir = resolveWorkingDir(projectDir, buildConfig.workingDir);
  const timeout = Math.min(buildConfig.timeout ?? 300, 900);

  // Merge config env with deploy-specific overrides
  const env: Record<string, string> = {
    ...buildConfig.env,
    NODE_ENV: "production",
    BUILD_OUT_DIR: deployOutDir,
  };
  if (basePath !== undefined) {
    env.BASE_PATH = basePath;
  }

  console.log(
    `[deploy] Running custom build: ${command} in ${workingDir} (out=${deployOutDir})`,
  );

  const result = await executeBuild({
    command,
    workingDir,
    env,
    timeout,
    onLog: (line, stream) => {
      const prefix = stream === "stderr" ? "[stderr]" : "[stdout]";
      console.log(`[build] ${prefix} ${line}`);
    },
  });

  const outDirAbs = path.join(
    projectDir,
    buildConfig.outDir ?? deployOutDir,
  );

  if (!result.success) {
    const errMsg = result.stderr.slice(-300) || `Exit code: ${result.exitCode}`;
    throw new Error(`Custom build failed: ${errMsg}`);
  }

  return {
    success: true,
    outDirAbs,
    duration: result.duration,
    usedCustomCommand: true,
  };
}

// ── Native build.ts build ───────────────────────────────────

async function runNativeBuild(
  projectDir: string,
  deployOutDir: string,
  basePath?: string,
): Promise<SiteBuildResult> {
  const start = Date.now();

  console.log(
    `[deploy] Running native build.ts in ${projectDir} (out=${deployOutDir}/)`,
  );

  try {
    execFileSync("npx", ["tsx", "build.ts"], {
      cwd: projectDir,
      timeout: 60000,
      env: {
        ...process.env,
        NODE_ENV: "production",
        BASE_PATH: basePath ?? "",
        BUILD_OUT_DIR: deployOutDir,
      },
      stdio: "pipe",
    });
  } catch (err) {
    const msg =
      err instanceof Error
        ? (err as Error & { stderr?: Buffer }).stderr?.toString().slice(0, 300) ||
          err.message
        : "Build failed";
    throw new Error(`Build failed: ${msg}`);
  }

  const outDirAbs = path.join(projectDir, deployOutDir);
  if (!existsSync(outDirAbs)) {
    throw new Error(
      `Build completed but no ${deployOutDir}/ directory was created.`,
    );
  }

  return {
    success: true,
    outDirAbs,
    duration: Date.now() - start,
    usedCustomCommand: false,
  };
}
