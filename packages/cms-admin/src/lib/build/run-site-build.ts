/**
 * F126 — Run site build (custom command or native build.ts).
 *
 * Used by deploy-service to abstract whether a site uses the native
 * TypeScript build pipeline or a custom build command (Laravel, Hugo, etc.).
 * Supports build profiles (Phase 3).
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { CmsConfig } from "@webhouse/cms";
import { executeBuild } from "./executor";
import { resolveWorkingDir } from "./validate-paths";
import { resolveProfile } from "./resolve-profile";

export interface SiteBuildOptions {
  /** Absolute path to site project directory. */
  projectDir: string;
  /** CMS config (for reading build.command etc.). */
  cmsConfig: CmsConfig;
  /** Deploy output directory name (e.g. "deploy"). Overrides config outDir for deploy. */
  deployOutDir: string;
  /** BASE_PATH env var for the build. */
  basePath?: string;
  /** Profile name to use (Phase 3). If omitted, uses default profile. */
  profileName?: string;
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
  /** Name of the profile used. */
  profileName?: string;
}

/**
 * Run a site build — either via a resolved build profile from cms.config.ts,
 * or the native `npx tsx build.ts` fallback.
 */
export async function runSiteBuild(
  opts: SiteBuildOptions,
): Promise<SiteBuildResult> {
  const { projectDir, cmsConfig, deployOutDir, basePath, profileName } = opts;

  // Phase 3: resolve profile (handles both profiles[] and root command)
  const profile = resolveProfile(cmsConfig.build, profileName);

  if (profile) {
    return runCustomBuild(projectDir, profile, deployOutDir, basePath);
  }
  // F143 P4: prepare extra deps before running native build. Scans build.ts
  // imports + merges with cms.config.ts.build.deps; installs anything cms-
  // admin doesn't already provide into the content-addressable deps store.
  const extraDeps = await prepareExtraDeps(projectDir, cmsConfig);
  return runNativeBuild(projectDir, deployOutDir, basePath, extraDeps);
}

/**
 * F143 P4 — Resolve the full deps-set for a site (manual `build.deps`
 * + auto-detected from build.ts), install if needed, return the deps-
 * store node_modules path so runNativeBuild can splice it into NODE_PATH.
 *
 * Returns null if no extra deps are needed (cms-admin's core pulje
 * covers everything the build imports).
 */
async function prepareExtraDeps(
  projectDir: string,
  cmsConfig: CmsConfig,
): Promise<string | null> {
  const { scanBuildFile } = await import("../build-server/dep-scanner");
  const { hashDeps, normalizeDeps, isDepsSetInstalled, resolveDepsNodeModulesPath } = await import("../build-server/deps-store");
  const { installDepsSet } = await import("../build-server/installer");
  const { getAdminDataDir } = await import("../site-registry");

  const buildFile = path.join(projectDir, "build.ts");
  const scanned = await scanBuildFile(buildFile);
  const manualDeps = (cmsConfig.build?.deps ?? []) as string[];
  const combined = normalizeDeps([...manualDeps, ...scanned.missing]);

  if (combined.length === 0) return null;

  const dataDir = getAdminDataDir();
  const hash = hashDeps(combined);

  if (!isDepsSetInstalled(dataDir, hash)) {
    console.log(`[deploy] Installing ${combined.length} extra dep(s) into deps-store ${hash.slice(0, 8)}…`);
    const result = await installDepsSet({ hash, deps: combined, dataDir });
    if (result.status === "failed") {
      throw new Error(`Failed to install extra deps: ${result.error}\n${result.logTail}`);
    }
    if (result.status === "success") {
      console.log(`[deploy] Installed extra deps in ${result.durationMs}ms`);
    }
  }

  return resolveDepsNodeModulesPath(dataDir, hash);
}

// ── Custom command build ────────────────────────────────────

async function runCustomBuild(
  projectDir: string,
  profile: { name: string; command: string; outDir: string; workingDir?: string; env?: Record<string, string>; timeout?: number; docker?: import("@webhouse/cms").DockerConfig },
  deployOutDir: string,
  basePath?: string,
): Promise<SiteBuildResult> {
  const workingDir = resolveWorkingDir(projectDir, profile.workingDir);
  const timeout = Math.min(profile.timeout ?? 300, 900);

  // Merge profile env with deploy-specific overrides
  const env: Record<string, string> = {
    ...profile.env,
    NODE_ENV: "production",
    BUILD_OUT_DIR: deployOutDir,
  };
  if (basePath !== undefined) {
    env.BASE_PATH = basePath;
  }

  console.log(
    `[deploy] Running build profile "${profile.name}": ${profile.command} in ${workingDir} (out=${deployOutDir})`,
  );

  const result = await executeBuild({
    command: profile.command,
    workingDir,
    env,
    timeout,
    docker: profile.docker,
    onLog: (line, stream) => {
      const prefix = stream === "stderr" ? "[stderr]" : "[stdout]";
      console.log(`[build] ${prefix} ${line}`);
    },
  });

  const outDirAbs = path.join(projectDir, profile.outDir ?? deployOutDir);

  if (!result.success) {
    const errMsg = result.stderr.slice(-300) || `Exit code: ${result.exitCode}`;
    throw new Error(`Build "${profile.name}" failed: ${errMsg}`);
  }

  return {
    success: true,
    outDirAbs,
    duration: result.duration,
    usedCustomCommand: true,
    profileName: profile.name,
  };
}

// ── Native build.ts build ───────────────────────────────────

/**
 * Provide cms-admin's build runtime to site builds so sites don't need their
 * own node_modules, package.json, or pinned `@webhouse/cms` version.
 *
 * A static site should be just: cms.config.ts + build.ts + content/ + public/.
 * cms-admin owns the runtime (`@webhouse/cms`, `marked`, `tsx`) and injects it
 * via an ESM loader hook that rewrites bare imports to resolve from cms-admin's
 * node_modules tree. No per-site deps, no version pin, no stale-publish issues.
 */
function resolveProvidedRuntime(): { tsxBin: string | null; loaderPath: string; adminRoot: string } {
  // cms-admin is always the running process (PM2 + next dev set cwd).
  const adminRoot = process.cwd();
  // Monorepo root sits two levels up from packages/cms-admin/.
  const repoRoot = path.resolve(adminRoot, "..", "..");

  const tsxCandidates = [
    path.join(repoRoot, "node_modules", ".bin", "tsx"),
    path.join(adminRoot, "node_modules", ".bin", "tsx"),
  ];
  const tsxBin = tsxCandidates.find((p) => existsSync(p)) ?? null;
  const loaderPath = path.join(adminRoot, "scripts", "build-runtime-loader.mjs");

  return { tsxBin, loaderPath, adminRoot };
}

async function runNativeBuild(
  projectDir: string,
  deployOutDir: string,
  basePath?: string,
  extraDepsNodeModules?: string | null,
): Promise<SiteBuildResult> {
  const start = Date.now();
  const { tsxBin, loaderPath, adminRoot } = resolveProvidedRuntime();

  // Prefer cms-admin's own tsx + runtime loader. Falls back to `npx tsx` only
  // if the monorepo layout changed (defensive).
  const useProvided = tsxBin !== null && existsSync(loaderPath);
  const bin = useProvided ? tsxBin! : "npx";
  const args = useProvided ? ["build.ts"] : ["tsx", "build.ts"];

  console.log(
    `[deploy] Running native build.ts in ${projectDir} (out=${deployOutDir}/) — runtime=${useProvided ? "cms-admin" : "npx"}`,
  );

  const providedEnv: Record<string, string> = useProvided
    ? {
        CMS_ADMIN_ROOT: adminRoot,
        NODE_OPTIONS:
          `--loader=${loaderPath}` +
          (process.env.NODE_OPTIONS ? " " + process.env.NODE_OPTIONS : ""),
      }
    : {};

  // F143 P4: splice the extra-deps store into NODE_PATH so build.ts
  // imports of `lodash`, `three`, etc. resolve via that dir AFTER
  // cms-admin's own node_modules but before npm registry fallback.
  if (extraDepsNodeModules) {
    const existing = providedEnv.NODE_PATH ?? process.env.NODE_PATH ?? "";
    providedEnv.NODE_PATH = existing
      ? `${existing}:${extraDepsNodeModules}`
      : extraDepsNodeModules;
  }

  try {
    execFileSync(bin, args, {
      cwd: projectDir,
      timeout: 60000,
      env: {
        ...process.env,
        NODE_ENV: "production",
        BASE_PATH: basePath ?? "",
        BUILD_OUT_DIR: deployOutDir,
        ...providedEnv,
      },
      stdio: "pipe",
    });
  } catch (err) {
    const stderr = err instanceof Error
      ? (err as Error & { stderr?: Buffer }).stderr?.toString() ?? ""
      : "";
    // Tail of stderr — the actual error typically lands last; npm/pnpm
    // warnings dominate the head and would otherwise hide the real cause.
    const msg = stderr.trim().slice(-500) || (err instanceof Error ? err.message : "Build failed");
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
