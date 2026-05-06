/**
 * F144 P3 completion — source resolution for ephemeral builder VMs.
 *
 * The orchestrator can't pack a tarball without a local directory tree.
 * For sites whose source lives on a different repo (or a pre-staged
 * volume location), this module resolves a logical source URL into a
 * concrete on-disk directory the orchestrator can hand to packSourceTar.
 *
 * Two source kinds are supported:
 *
 *   github:owner/repo[:subdir]  → shallow git clone --depth=1 to /tmp,
 *                                  optionally narrow to a subdir
 *   local:/absolute/path        → pass the path through unchanged
 *
 * Callers MUST invoke `cleanup()` on the returned handle in a finally
 * block — the github branch creates a tmp dir that would otherwise leak.
 * `cleanup()` is idempotent and a no-op for `local:` sources.
 */
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

export type ParsedSource =
  | { kind: "github"; owner: string; repo: string; subdir?: string }
  | { kind: "local"; path: string };

export class SourceParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceParseError";
  }
}

const GITHUB_RE = /^github:([\w.-]+)\/([\w.-]+)(?::(.+))?$/;
const LOCAL_RE = /^local:(\/.+)$/;

export function parseSourceUrl(source: string): ParsedSource {
  const trimmed = source.trim();
  if (!trimmed) throw new SourceParseError("source is empty");

  const ghMatch = GITHUB_RE.exec(trimmed);
  if (ghMatch) {
    const owner = ghMatch[1]!;
    const repo = ghMatch[2]!;
    const subdir = ghMatch[3];
    return subdir
      ? { kind: "github", owner, repo, subdir }
      : { kind: "github", owner, repo };
  }

  const localMatch = LOCAL_RE.exec(trimmed);
  if (localMatch) {
    return { kind: "local", path: localMatch[1]! };
  }

  throw new SourceParseError(
    `Invalid source URL: "${source}". Expected "github:owner/repo[:subdir]" or "local:/absolute/path".`,
  );
}

/**
 * Pluggable git command runner. Tests inject a fake; production uses the
 * default which spawns the real `git` binary via execFileSync.
 */
export type GitRunner = (
  args: string[],
  opts: { cwd?: string; timeout: number },
) => string;

const defaultGitRunner: GitRunner = (args, opts) => {
  const result = execFileSync("git", args, {
    ...(opts.cwd && { cwd: opts.cwd }),
    timeout: opts.timeout,
    stdio: "pipe",
  });
  return result.toString();
};

export interface FetchSourceOptions {
  /** Source URL (github:... or local:...). */
  source: string;
  /** Branch to clone (github only). Default: main. */
  branch?: string;
  /** Token for cloning private github repos. Omit for public. */
  token?: string;
  /** Override tmp base for tests. Default: OS tmpdir. */
  tmpBase?: string;
  /** Inject git runner for tests. Default: real git. */
  gitRunner?: GitRunner;
}

export interface FetchedSource {
  /** Absolute path to the resolved source root (subdir applied if specified). */
  dir: string;
  /** Idempotent cleanup callback. Always call in finally. */
  cleanup: () => void;
  /** Effective ref info — branch always present, sha when available. */
  ref: { branch: string; sha?: string };
}

const CLONE_TIMEOUT_MS = 120_000;
const REV_PARSE_TIMEOUT_MS = 10_000;

export async function fetchSource(opts: FetchSourceOptions): Promise<FetchedSource> {
  const parsed = parseSourceUrl(opts.source);
  const branch = opts.branch?.trim() || "main";

  if (parsed.kind === "local") {
    if (!existsSync(parsed.path)) {
      throw new Error(`local source path does not exist: ${parsed.path}`);
    }
    return {
      dir: parsed.path,
      cleanup: () => {},
      ref: { branch },
    };
  }

  // github
  const tmpBase = opts.tmpBase || tmpdir();
  const cloneDir = mkdtempSync(path.join(tmpBase, `cms-source-${parsed.owner}-${parsed.repo}-`));
  const gitRunner = opts.gitRunner || defaultGitRunner;
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    try { rmSync(cloneDir, { recursive: true, force: true }); } catch { /* idempotent */ }
  };

  try {
    const cloneUrl = opts.token
      ? `https://x-access-token:${opts.token}@github.com/${parsed.owner}/${parsed.repo}.git`
      : `https://github.com/${parsed.owner}/${parsed.repo}.git`;

    gitRunner(
      ["clone", "--depth=1", "--branch", branch, cloneUrl, cloneDir],
      { timeout: CLONE_TIMEOUT_MS },
    );

    let sha: string | undefined;
    try {
      sha = gitRunner(["rev-parse", "HEAD"], {
        cwd: cloneDir,
        timeout: REV_PARSE_TIMEOUT_MS,
      }).trim() || undefined;
    } catch { /* non-fatal — sha is best-effort */ }

    const finalDir = parsed.subdir ? path.join(cloneDir, parsed.subdir) : cloneDir;
    if (!existsSync(finalDir)) {
      throw new Error(`subdir not found in cloned repo: ${parsed.subdir}`);
    }

    return {
      dir: finalDir,
      cleanup,
      ref: sha ? { branch, sha } : { branch },
    };
  } catch (err) {
    cleanup();
    throw err;
  }
}
