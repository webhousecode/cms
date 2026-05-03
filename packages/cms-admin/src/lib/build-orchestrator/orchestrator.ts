/**
 * F144 P3 — End-to-end SSR build orchestrator.
 *
 * Glues source-tar packaging + Dockerfile generation + Fly Machines
 * lifecycle into a single call site. Used by deploy-service when a
 * site's framework is Next.js / Bun-Hono / has its own Dockerfile.
 *
 *   buildSsrSite({ siteId, sha, projectDir, framework, … })
 *     → packs source tar
 *     → generates framework-appropriate Dockerfile
 *     → spawns ephemeral Fly builder VM (cms-builder image)
 *     → streams logs, awaits completion
 *     → returns { imageTag, success, durationMs }
 *
 * The actual `buildah bud` runs inside the VM (entrypoint.sh in
 * packages/cms-admin/builder). This orchestrator only ships work to
 * the VM and watches it complete.
 */

import { existsSync } from "node:fs";
import path from "node:path";

import { detectFrameworkFromFiles, generateDockerfile } from "./dockerfile-templates";
import type { FrameworkKind } from "./dockerfile-templates";
import { runBuilderEndToEnd } from "./fly-machines";
import { packSourceTar } from "./source-tar";

export interface BuildSsrSiteOptions {
  /** Site id — used in image tag + machine name. */
  siteId: string;
  /** Commit SHA / content hash — image tag suffix. */
  sha: string;
  /** Local site project directory containing source. */
  projectDir: string;
  /** Optional content dir (filesystem sites) packaged into source tar. */
  contentDir?: string;
  /** Target Fly app the resulting image will deploy to. */
  targetApp: string;
  /** Framework override. Auto-detected from filesystem signals if omitted. */
  framework?: FrameworkKind;
  /** Override the runtime port the generated Dockerfile EXPOSEs. */
  runtimePort?: number;
  /** Custom build/start commands forwarded to the Dockerfile generator. */
  customBuildCommand?: string;
  customStartCommand?: string;

  /** Builder image tag — usually ghcr.io/webhousecode/cms-builder:latest. */
  builderImage?: string;
  /** Fly app that hosts the builder VMs. Default: webhouse-builders. */
  builderApp?: string;
  /** GHCR push token for the builder. */
  registryToken: string;
  /** URL the builder POSTs status callbacks to. */
  callbackUrl: string;
  /** Bearer token for callback POSTs. */
  callbackToken: string;
  /** Override Fly API token (for tests). Falls back to FLY_API_TOKEN. */
  flyToken?: string;

  /** Optional log line callback — wired into Fly logs polling. */
  onLog?: (line: string) => void;
}

export interface BuildSsrSiteResult {
  success: boolean;
  imageTag: string;
  machineId: string;
  durationMs: number;
  exitCode: number | null;
  finalState: string;
  framework: FrameworkKind;
  sourceFileCount: number;
  sourceBytes: number;
}

const DEFAULT_BUILDER_APP = "webhouse-builders";
const DEFAULT_BUILDER_IMAGE = "ghcr.io/webhousecode/cms-builder:latest";

/**
 * Detect framework by checking the on-disk signals beam already knows
 * about. Falls back to nextjs when nothing matches (most-common case).
 */
export function detectProjectFramework(projectDir: string): FrameworkKind {
  return detectFrameworkFromFiles({
    hasDockerfile: existsSync(path.join(projectDir, "Dockerfile")),
    hasNextConfig:
      existsSync(path.join(projectDir, "next.config.ts")) ||
      existsSync(path.join(projectDir, "next.config.js")) ||
      existsSync(path.join(projectDir, "next.config.mjs")),
    hasBunLockb: existsSync(path.join(projectDir, "bun.lockb")),
    hasViteConfig:
      existsSync(path.join(projectDir, "vite.config.ts")) ||
      existsSync(path.join(projectDir, "vite.config.js")),
    hasBuildTs: existsSync(path.join(projectDir, "build.ts")),
  });
}

/**
 * Run an SSR build end-to-end. Returns once the builder VM has reached
 * a terminal state. Throws if framework === "static" (use F143 path).
 */
export async function buildSsrSite(opts: BuildSsrSiteOptions): Promise<BuildSsrSiteResult> {
  const framework = opts.framework ?? detectProjectFramework(opts.projectDir);

  if (framework === "static") {
    throw new Error(
      "F144 buildSsrSite called for a static site — use F143 in-process " +
        "build path instead (cms-admin runs build.ts directly).",
    );
  }

  // Custom framework → site already has a Dockerfile in source/. We
  // ship an empty generated Dockerfile placeholder; the builder VM's
  // entrypoint detects source/Dockerfile and uses it instead.
  let dockerfile = "";
  if (framework !== "custom") {
    dockerfile = generateDockerfile({
      framework,
      ...(opts.runtimePort !== undefined && { runtimePort: opts.runtimePort }),
      ...(opts.customBuildCommand && { customBuildCommand: opts.customBuildCommand }),
      ...(opts.customStartCommand && { customStartCommand: opts.customStartCommand }),
    });
  }

  // Pack source tar
  const tar = await packSourceTar({
    projectDir: opts.projectDir,
    ...(opts.contentDir && { contentDir: opts.contentDir }),
  });

  const result = await runBuilderEndToEnd({
    appName: opts.builderApp ?? DEFAULT_BUILDER_APP,
    siteId: opts.siteId,
    sha: opts.sha,
    targetApp: opts.targetApp,
    builderImage: opts.builderImage ?? DEFAULT_BUILDER_IMAGE,
    registryToken: opts.registryToken,
    callbackUrl: opts.callbackUrl,
    callbackToken: opts.callbackToken,
    sourceTarGz: tar.tarGz,
    dockerfile,
    ...(opts.flyToken && { flyToken: opts.flyToken }),
    ...(opts.onLog && { onLog: opts.onLog }),
  });

  return {
    success: result.completion.success,
    imageTag: result.imageTag,
    machineId: result.machineId,
    durationMs: result.completion.durationMs,
    exitCode: result.completion.exitCode,
    finalState: result.completion.finalState,
    framework,
    sourceFileCount: tar.fileCount,
    sourceBytes: tar.rawBytes,
  };
}
