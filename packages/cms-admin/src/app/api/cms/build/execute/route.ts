/**
 * F126 — Custom Build Executor API
 *
 * POST /api/cms/build/execute
 * Streams NDJSON build events (start, log, complete, error).
 * Requires admin role. Falls back to native pipeline if no build.command.
 */
import { NextRequest } from "next/server";
import { denyViewers } from "@/lib/require-role";
import { getAdminConfig } from "@/lib/cms";
import { getActiveSitePaths } from "@/lib/site-paths";
import { executeBuild } from "@/lib/build/executor";
import { resolveWorkingDir, resolveOutDir } from "@/lib/build/validate-paths";
import {
  isCommandAllowed,
  type OrgBuildSettings,
} from "@/lib/build/allowlist";

/**
 * Self-hosted default: allow all custom commands.
 * Future: load from org-settings when hosted offering ships.
 */
function getOrgBuildSettings(): OrgBuildSettings {
  return {
    allowCustomBuildCommands: true,
    allowedCommands: [], // empty = no restriction
    maxTimeout: 900,
  };
}

export async function POST(req: NextRequest) {
  const denied = await denyViewers();
  if (denied) return denied;

  let config;
  let sitePaths;
  try {
    [config, sitePaths] = await Promise.all([
      getAdminConfig(),
      getActiveSitePaths(),
    ]);
  } catch (err) {
    return new Response(
      JSON.stringify({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to load site",
      }) + "\n",
      { status: 500, headers: { "Content-Type": "application/x-ndjson" } },
    );
  }

  const buildConfig = config.build;
  if (!buildConfig?.command) {
    return new Response(
      JSON.stringify({
        type: "error",
        message:
          "No build.command configured in cms.config.ts. Use the native pipeline via the Deploy button instead.",
      }) + "\n",
      { status: 400, headers: { "Content-Type": "application/x-ndjson" } },
    );
  }

  // Validate command against org settings
  const orgSettings = getOrgBuildSettings();
  if (!isCommandAllowed(buildConfig.command, orgSettings)) {
    return new Response(
      JSON.stringify({
        type: "error",
        message: `Command "${buildConfig.command}" is not allowed by organization settings.`,
      }) + "\n",
      { status: 403, headers: { "Content-Type": "application/x-ndjson" } },
    );
  }

  // Resolve and validate paths
  let workingDir: string;
  let outDirAbs: string;
  try {
    workingDir = resolveWorkingDir(
      sitePaths.projectDir,
      buildConfig.workingDir,
    );
    outDirAbs = resolveOutDir(
      sitePaths.projectDir,
      buildConfig.outDir ?? "dist",
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        type: "error",
        message: err instanceof Error ? err.message : "Path validation failed",
      }) + "\n",
      { status: 400, headers: { "Content-Type": "application/x-ndjson" } },
    );
  }

  const timeout = Math.min(
    buildConfig.timeout ?? 300,
    orgSettings.maxTimeout ?? 900,
  );

  // Read optional body (env overrides)
  let bodyEnv: Record<string, string> = {};
  try {
    const body = await req.json();
    if (body?.env && typeof body.env === "object") {
      bodyEnv = body.env;
    }
  } catch {
    // No body or invalid JSON — that's fine
  }

  // Stream NDJSON
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      emit({
        type: "start",
        command: buildConfig.command,
        workingDir,
        outDir: buildConfig.outDir ?? "dist",
        timeout,
      });

      try {
        const result = await executeBuild({
          command: buildConfig.command!,
          workingDir,
          env: { ...buildConfig.env, ...bodyEnv },
          timeout,
          onLog: (line, streamName) => {
            emit({
              type: "log",
              stream: streamName,
              line,
              timestamp: new Date().toISOString(),
            });
          },
        });

        emit({
          type: "complete",
          success: result.success,
          exitCode: result.exitCode ?? -1,
          duration: result.duration,
          outDir: buildConfig.outDir ?? "dist",
          outDirAbs,
          buildId: result.buildId,
          cancelled: result.cancelled,
        });
      } catch (err) {
        emit({
          type: "error",
          message: err instanceof Error ? err.message : "Build execution failed",
        });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
