/**
 * F126 — Secure build command executor.
 *
 * Spawns user-configured build commands with `shell: false` to prevent
 * shell injection. Streams stdout/stderr line-by-line. Enforces timeout
 * with SIGTERM→SIGKILL escalation. Filters environment variables.
 */
import { spawn, type ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import { parseCommand } from "./allowlist";
import type { DockerConfig } from "@webhouse/cms";

// ── Types ────────────────────────────────────────────────────

export interface ExecuteOptions {
  /** The command string to run (parsed into argv internally). */
  command: string;
  /** Absolute working directory (validated by caller). */
  workingDir: string;
  /** Extra env vars (filtered through allowlist). */
  env?: Record<string, string>;
  /** Timeout in seconds. */
  timeout: number;
  /** Line-by-line log callback. */
  onLog?: (line: string, stream: "stdout" | "stderr") => void;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
  /** Docker config for containerized builds (Phase 4). */
  docker?: DockerConfig;
}

export interface ExecuteResult {
  success: boolean;
  exitCode: number | null;
  /** Last 10KB of stdout. */
  stdout: string;
  /** Last 10KB of stderr. */
  stderr: string;
  /** Duration in milliseconds. */
  duration: number;
  buildId: string;
  cancelled: boolean;
}

// ── Env var safety ───────────────────────────────────────────

const ALLOWED_ENV_VARS = new Set([
  "APP_ENV",
  "NODE_ENV",
  "RAILS_ENV",
  "DJANGO_SETTINGS_MODULE",
  "HUGO_ENV",
  "JEKYLL_ENV",
  "BASE_URL",
  "BASE_PATH",
  "BUILD_OUT_DIR",
  "PUBLIC_URL",
  "DOTNET_ENVIRONMENT",
  "GOPATH",
  "GOFLAGS",
  "MIX_ENV",
]);

const BLOCKED_ENV_VARS = new Set([
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
]);

/** Max buffer size for stored stdout/stderr (10KB). */
const MAX_BUFFER = 10240;

/** Grace period before SIGKILL after SIGTERM (ms). */
const SIGKILL_GRACE_MS = 5000;

// ── Executor ─────────────────────────────────────────────────

export async function executeBuild(
  opts: ExecuteOptions,
): Promise<ExecuteResult> {
  const buildId = randomUUID();
  const start = Date.now();

  // Filter env vars
  const safeEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(opts.env ?? {})) {
    if (BLOCKED_ENV_VARS.has(key)) {
      throw new Error(
        `Environment variable "${key}" is blocked for security reasons.`,
      );
    }
    if (ALLOWED_ENV_VARS.has(key)) {
      safeEnv[key] = value;
    }
    // Unknown vars are silently dropped
  }

  // Parse command into argv — no shell
  const argv = parseCommand(opts.command);
  if (argv.length === 0) {
    throw new Error("Empty build command");
  }
  const [rawCmd, ...rawArgs] = argv;

  // Docker wrapping (Phase 4): wrap command inside `docker run`
  let cmd: string;
  let args: string[];
  if (opts.docker) {
    const d = opts.docker;
    const workdir = d.workdir ?? "/workspace";
    const dockerArgs = [
      "run", "--rm",
      "-v", `${opts.workingDir}:${workdir}`,
      "-w", workdir,
    ];
    // Pass env vars into container
    for (const [k, v] of Object.entries(safeEnv)) {
      dockerArgs.push("-e", `${k}=${v}`);
    }
    for (const [k, v] of Object.entries(d.env ?? {})) {
      dockerArgs.push("-e", `${k}=${v}`);
    }
    // Additional volume mounts
    for (const vol of d.volumes ?? []) {
      dockerArgs.push("-v", vol);
    }
    dockerArgs.push(d.image, rawCmd as string, ...rawArgs);
    cmd = "docker";
    args = dockerArgs;
  } else {
    cmd = rawCmd as string;
    args = rawArgs;
  }

  return new Promise<ExecuteResult>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let cancelled = false;
    let child: ChildProcess | null = null;
    let killTimer: ReturnType<typeof setTimeout> | null = null;

    // Timeout enforcement
    const timer = setTimeout(() => {
      if (child) {
        child.kill("SIGTERM");
        killTimer = setTimeout(() => child?.kill("SIGKILL"), SIGKILL_GRACE_MS);
      }
    }, opts.timeout * 1000);

    // Cancellation via AbortSignal
    const onAbort = () => {
      cancelled = true;
      child?.kill("SIGTERM");
      killTimer = setTimeout(() => child?.kill("SIGKILL"), SIGKILL_GRACE_MS);
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      child = spawn(cmd as string, args, {
        cwd: opts.workingDir,
        env: {
          ...safeEnv,
          // PATH and HOME are needed for command lookup
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
        } as unknown as NodeJS.ProcessEnv,
        shell: false, // CRITICAL: no shell interpretation
        stdio: ["ignore", "pipe", "pipe"],
      });
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const proc = child!; // non-null immediately after spawn

      proc.stdout?.setEncoding("utf8");
      proc.stderr?.setEncoding("utf8");

      proc.stdout?.on("data", (chunk: string) => {
        stdout += chunk;
        // Keep only last MAX_BUFFER bytes
        if (stdout.length > MAX_BUFFER * 2) {
          stdout = stdout.slice(-MAX_BUFFER);
        }
        for (const line of chunk.split("\n")) {
          if (line) opts.onLog?.(line, "stdout");
        }
      });

      proc.stderr?.on("data", (chunk: string) => {
        stderr += chunk;
        if (stderr.length > MAX_BUFFER * 2) {
          stderr = stderr.slice(-MAX_BUFFER);
        }
        for (const line of chunk.split("\n")) {
          if (line) opts.onLog?.(line, "stderr");
        }
      });

      proc.on("close", (code) => {
        clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
        opts.signal?.removeEventListener("abort", onAbort);
        resolve({
          success: code === 0 && !cancelled,
          exitCode: code,
          stdout: stdout.slice(-MAX_BUFFER),
          stderr: stderr.slice(-MAX_BUFFER),
          duration: Date.now() - start,
          buildId,
          cancelled,
        });
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
        opts.signal?.removeEventListener("abort", onAbort);
        reject(err);
      });
    } catch (err) {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      opts.signal?.removeEventListener("abort", onAbort);
      reject(err);
    }
  });
}
