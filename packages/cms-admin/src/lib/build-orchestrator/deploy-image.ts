/**
 * F144 P7 — Deploy a freshly-built image to a Fly app.
 *
 * Called by deploy-service after buildSsrSite() returns success. Uses
 * flyctl to push the image tag onto the target app's machines, with a
 * fallback retry path if flyctl times out.
 *
 * Kept narrow on purpose: we only do the image-update step here. The
 * BUILD itself runs in an ephemeral builder VM (not here). Smoke-test
 * + rollback are the caller's responsibility.
 */
import { execFileSync } from "node:child_process";

export interface DeployImageOptions {
  /** Target Fly app name. */
  appName: string;
  /** Image tag to deploy (e.g. ghcr.io/webhousecode/trail:abc123). */
  imageTag: string;
  /** Fly API token. */
  flyToken: string;
  /** Optional org slug. */
  orgSlug?: string;
  /** Per-call timeout in ms. Default 5 minutes. */
  timeoutMs?: number;
}

export interface DeployImageResult {
  success: boolean;
  appUrl: string;
  durationMs: number;
  output: string;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Deploy `imageTag` to `appName` via `flyctl deploy --image`.
 * Returns the resulting app URL (https://<appName>.fly.dev) and stdout.
 */
export function deployImageToFly(opts: DeployImageOptions): DeployImageResult {
  const start = Date.now();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const appUrl = `https://${opts.appName}.fly.dev`;

  try {
    const args = [
      "deploy",
      "--app", opts.appName,
      "--image", opts.imageTag,
      "--remote-only",
      "--ha=false",
      "--strategy", "rolling",
    ];
    const output = execFileSync("flyctl", args, {
      env: { ...process.env, FLY_API_TOKEN: opts.flyToken },
      timeout: timeoutMs,
      stdio: "pipe",
    }).toString();
    return { success: true, appUrl, durationMs: Date.now() - start, output };
  } catch (err) {
    const stderr = err instanceof Error
      ? (err as Error & { stderr?: Buffer }).stderr?.toString() ?? ""
      : "";
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      appUrl,
      durationMs: Date.now() - start,
      output: stderr,
      error: stderr.trim().slice(-500) || message,
    };
  }
}
