/**
 * F143 P3 — On-demand `pnpm install` into a deps-store directory.
 *
 * Wraps pnpm install with timeout, log capture, and a process-wide
 * mutex (`install-queue.ts`) so concurrent build triggers don't race
 * on the same deps-store directory or thrash the pnpm content-addressable
 * cache. Each install:
 *
 *   1. Writes a minimal `package.json` to the target dir
 *   2. Runs `pnpm install --prefer-offline --ignore-scripts --prod`
 *      with the deps as positional args
 *   3. Captures combined stdout/stderr to an `install-log.txt` next to
 *      the package.json (useful for Deploy-modal display + post-mortem)
 *   4. Returns the InstallResult with status, duration, and log tail
 *
 * `--ignore-scripts` is ON by default for security (post-install scripts
 * from arbitrary npm packages would otherwise execute on the Fly volume).
 * Sites that genuinely need post-install (rare — typically native modules
 * compiled at install time, e.g. `better-sqlite3`) can opt in via a
 * future `cms.config.ts.build.allowPostInstall: boolean` flag (Phase 5).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { ensureDepsStoreRoot, normalizeDeps } from "./deps-store";
import { runInInstallQueue } from "./install-queue";

export interface InstallResult {
  status: "success" | "failed" | "skipped";
  hash: string;
  storeDir: string | null;
  durationMs: number;
  /** Tail of install log (last 4 KB), suitable for UI display. */
  logTail: string;
  /** Full path to install-log.txt for the Deploy-modal "View full log" link. */
  logPath: string | null;
  /** Error message if status === 'failed'. */
  error?: string;
}

export interface InstallOptions {
  /** Hash of the dep-set, computed via hashDeps(). */
  hash: string;
  /** Normalized list of npm specifiers to install. */
  deps: string[];
  /** cms-admin's data dir (where build-deps/ lives). */
  dataDir: string;
  /** Hard timeout in ms. Default: 5 minutes. */
  timeoutMs?: number;
  /** Override pnpm binary path. Default: looks up in PATH. */
  pnpmBin?: string;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Install a normalized dep-set into its content-addressable directory.
 * Idempotent: if the dir already has a node_modules + matching deps in
 * package.json, returns 'skipped' immediately.
 *
 * Serialised via install-queue so two concurrent triggers on the same
 * volume can't fight each other.
 */
export async function installDepsSet(opts: InstallOptions): Promise<InstallResult> {
  return runInInstallQueue(opts.hash, () => doInstall(opts));
}

async function doInstall(opts: InstallOptions): Promise<InstallResult> {
  const start = Date.now();
  const { hash, dataDir, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  const deps = normalizeDeps(opts.deps);

  // Empty dep-set: nothing to install. Treat as success so callers
  // don't have to special-case.
  if (deps.length === 0 || !hash) {
    return {
      status: "success",
      hash: "",
      storeDir: null,
      durationMs: 0,
      logTail: "(no extra deps required)",
      logPath: null,
    };
  }

  ensureDepsStoreRoot(dataDir);
  const storeDir = path.join(dataDir, "build-deps", hash);
  const logPath = path.join(storeDir, "install-log.txt");

  // Idempotency check — if package.json + node_modules already exist
  // and their dep-set matches what we'd be installing, skip.
  if (existsSync(path.join(storeDir, "package.json")) && existsSync(path.join(storeDir, "node_modules"))) {
    try {
      const existing = JSON.parse(readFileSync(path.join(storeDir, "package.json"), "utf-8")) as {
        dependencies?: Record<string, string>;
      };
      const existingDeps = depsObjectToSpecList(existing.dependencies ?? {});
      if (depSetsEqual(existingDeps, deps)) {
        return {
          status: "skipped",
          hash,
          storeDir,
          durationMs: Date.now() - start,
          logTail: "(deps already installed, skipped)",
          logPath: existsSync(logPath) ? logPath : null,
        };
      }
    } catch {
      // Malformed package.json — fall through to re-install
    }
  }

  // Fresh install: create dir, write package.json, run pnpm
  mkdirSync(storeDir, { recursive: true });
  writeFileSync(
    path.join(storeDir, "package.json"),
    JSON.stringify(
      {
        name: `cms-admin-build-deps-${hash}`,
        version: "0.0.0",
        private: true,
        dependencies: specListToDepsObject(deps),
      },
      null,
      2,
    ),
    "utf-8",
  );

  const pnpmBin = opts.pnpmBin ?? "pnpm";
  const args = [
    "install",
    "--prefer-offline",
    "--ignore-scripts",
    "--prod",
    "--config.confirmModulesPurge=false",
    // F143 P6 fix: produce a flat node_modules (each pkg as a real dir
    // instead of a pnpm symlink). The build-runtime-loader resolves bare
    // specifiers via `path.join(EXTRA_DEPS_DIR, pkgName)`, which only
    // works against a hoisted layout.
    "--config.nodeLinker=hoisted",
  ];

  return new Promise<InstallResult>((resolve) => {
    let stdout = "";
    const child = spawn(pnpmBin, args, {
      cwd: storeDir,
      env: { ...process.env, NODE_ENV: "production" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      try {
        child.kill("SIGTERM");
      } catch { /* ignore */ }
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });

    child.on("close", (code) => {
      clearTimeout(timer);
      try { writeFileSync(logPath, stdout, "utf-8"); } catch { /* ignore */ }
      const tail = stdout.length > 4096 ? "…\n" + stdout.slice(-4096) : stdout;
      if (killed) {
        resolve({
          status: "failed",
          hash,
          storeDir,
          durationMs: Date.now() - start,
          logTail: tail,
          logPath,
          error: `pnpm install timed out after ${Math.round(timeoutMs / 1000)}s`,
        });
        return;
      }
      if (code === 0) {
        resolve({
          status: "success",
          hash,
          storeDir,
          durationMs: Date.now() - start,
          logTail: tail,
          logPath,
        });
      } else {
        resolve({
          status: "failed",
          hash,
          storeDir,
          durationMs: Date.now() - start,
          logTail: tail,
          logPath,
          error: `pnpm install exited with code ${code}`,
        });
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        status: "failed",
        hash,
        storeDir,
        durationMs: Date.now() - start,
        logTail: stdout + "\n" + String(err),
        logPath: null,
        error: err.message,
      });
    });
  });
}

/** Convert ['three@^0.158.0', 'lodash'] → { three: '^0.158.0', lodash: 'latest' }. */
function specListToDepsObject(specs: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const spec of specs) {
    const atIdx = spec.indexOf("@", 1);
    if (atIdx > 0) {
      out[spec.slice(0, atIdx)] = spec.slice(atIdx + 1);
    } else {
      out[spec] = "latest";
    }
  }
  return out;
}

/** Convert { three: '^0.158.0', lodash: 'latest' } → ['lodash', 'three@^0.158.0']. */
function depsObjectToSpecList(deps: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [name, ver] of Object.entries(deps)) {
    out.push(ver === "latest" ? name : `${name}@${ver}`);
  }
  return out.sort();
}

/** Two normalized dep-sets equal? Both are pre-sorted via normalizeDeps. */
function depSetsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
