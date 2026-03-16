/**
 * GitSyncWatcher — polls a git repo for new commits and auto-pulls.
 *
 * Used by the CLI `dev` command to keep local dev servers in sync
 * with CMS content changes committed via the GitHub API.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface GitSyncOptions {
  cwd: string;
  intervalMs?: number; // default: 5000 (5s)
  branch?: string; // default: current branch
  onPull?: (files: string[]) => void;
  onError?: (error: string) => void;
}

export class GitSyncWatcher {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastCommit: string | null = null;

  constructor(private options: GitSyncOptions) {}

  async start(): Promise<void> {
    // Verify this is a git repo with a remote
    try {
      await this.git("remote", "get-url", "origin");
    } catch {
      throw new Error("Not a git repo with origin remote");
    }

    this.lastCommit = await this.getHeadCommit();
    const interval = this.options.intervalMs ?? 5000;
    this.timer = setInterval(() => this.check(), interval);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async check(): Promise<void> {
    if (this.running) return; // Skip if previous check still running
    this.running = true;

    try {
      const branch = this.options.branch ?? (await this.getCurrentBranch());

      // Fetch latest from origin (quiet, no output)
      await this.git("fetch", "origin", branch, "--quiet");

      // Compare local HEAD with origin/<branch>
      const localHead = await this.getHeadCommit();
      const remoteHead = await this.getCommit(`origin/${branch}`);

      if (localHead === remoteHead) {
        this.running = false;
        return; // Already up to date
      }

      // Check if we can fast-forward
      const mergeBase = await this.git("merge-base", localHead, remoteHead).catch(() => null);
      if (!mergeBase || mergeBase.trim() !== localHead) {
        this.options.onError?.("Cannot fast-forward — local changes diverge from remote. Stopping auto-sync.");
        this.stop();
        this.running = false;
        return;
      }

      // Get list of changed files before pulling
      const diffOutput = await this.git("diff", "--name-only", localHead, remoteHead);
      const changedFiles = diffOutput.trim().split("\n").filter(Boolean);

      // Fast-forward pull
      await this.git("pull", "--ff-only", "--quiet");

      this.lastCommit = remoteHead;

      if (changedFiles.length > 0) {
        this.options.onPull?.(changedFiles);
      }
    } catch (err) {
      // Don't stop on transient errors (network issues, etc.)
      // Just skip this cycle
    }

    this.running = false;
  }

  private async getHeadCommit(): Promise<string> {
    return (await this.git("rev-parse", "HEAD")).trim();
  }

  private async getCommit(ref: string): Promise<string> {
    return (await this.git("rev-parse", ref)).trim();
  }

  private async getCurrentBranch(): Promise<string> {
    return (await this.git("rev-parse", "--abbrev-ref", "HEAD")).trim();
  }

  private async git(...args: string[]): Promise<string> {
    const { stdout } = await exec("git", args, { cwd: this.options.cwd });
    return stdout;
  }
}
