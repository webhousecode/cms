/**
 * F144 P7 — End-to-end "fly-ephemeral" deploy.
 *
 * Glues the build-orchestrator (build VM via Fly Machines API) +
 * deploy-image (flyctl deploy --image) into one call site. Used by
 * deploy-service when a site's deploy provider is "fly-ephemeral".
 *
 *   runFlyEphemeralDeploy(opts)
 *     → resolve siteId / sha / target app
 *     → buildSsrSite() spawns ephemeral builder VM
 *     → on success, deployImageToFly() rolls the new tag to the app
 *     → returns { ok, appUrl, imageTag, durationMs }
 *
 * Errors return { ok: false, error: msg } instead of throwing so the
 * caller (deploy-service switch) can surface the message in the deploy
 * log.
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { getActiveSitePaths } from "../site-paths";
import type { SiteEntry } from "../site-registry";

import { buildSsrSite } from "./orchestrator";
import { deployImageToFly } from "./deploy-image";
import { fetchSource } from "./source-fetch";

export interface RunFlyEphemeralOptions {
  siteEntry: SiteEntry | null;
  configToken: string | undefined;
  configAppName: string | undefined;
  configOrg: string | undefined;
  /** NEXTAUTH_URL or equivalent — used to build the callback URL. */
  callbackBaseUrl: string;
  /** Override callback secret (for tests). Falls back to env. */
  callbackSecretOverride?: string;
  /** F144 source URL (github:owner/repo[:subdir] or local:/path). Empty falls back to sitePaths.projectDir. */
  configSource?: string;
  /** F144 branch for github sources. Default "main". */
  configSourceBranch?: string;
}

export interface RunFlyEphemeralResult {
  ok: boolean;
  appUrl?: string;
  imageTag?: string;
  durationMs?: number;
  error?: string;
}

const FLY_TOKEN_ENV = "FLY_API_TOKEN";

export async function runFlyEphemeralDeploy(
  opts: RunFlyEphemeralOptions,
): Promise<RunFlyEphemeralResult> {
  const start = Date.now();
  if (!opts.siteEntry) {
    return { ok: false, error: "no active site for fly-ephemeral deploy" };
  }
  const flyToken = opts.configToken || process.env[FLY_TOKEN_ENV] || "";
  if (!flyToken) {
    return {
      ok: false,
      error:
        "fly-ephemeral requires a Fly API token (per-site config or FLY_API_TOKEN env on cms-admin).",
    };
  }
  const targetApp = opts.configAppName;
  if (!targetApp) {
    return { ok: false, error: "fly-ephemeral requires deployAppName configured." };
  }
  if (!opts.callbackBaseUrl) {
    return {
      ok: false,
      error:
        "fly-ephemeral requires NEXTAUTH_URL (or equivalent) so the builder VM can call back.",
    };
  }
  const registryToken = process.env.GHCR_PUSH_TOKEN || "";
  if (!registryToken) {
    return {
      ok: false,
      error:
        "fly-ephemeral requires GHCR_PUSH_TOKEN env on cms-admin so the builder VM can push images.",
    };
  }

  const sitePaths = await getActiveSitePaths();
  // SHA = latest content-hash signal we have, fallback to timestamp. The
  // resulting image tag uniquely identifies this build attempt and feeds
  // the rollback lookup key.
  const sha = `cms-${Date.now().toString(36)}`;

  // Issue a callback token bound to this (siteId, sha) — built lazily so
  // the secret env-var error happens here, not at import time.
  const { issueCallbackToken } = await import("./callback-token");
  const callbackToken = issueCallbackToken({
    siteId: opts.siteEntry.id,
    sha,
  });
  const callbackUrl = `${opts.callbackBaseUrl.replace(/\/$/, "")}/api/builder/callback`;

  // F144 source resolution. If site config has deploySource set, fetch
  // from that URL (github clone or local pass-through). Otherwise fall
  // back to sitePaths.projectDir + content/ for legacy behavior.
  let projectDir = sitePaths.projectDir;
  let contentDir: string | undefined = existsSync(path.join(sitePaths.projectDir, "content"))
    ? path.join(sitePaths.projectDir, "content")
    : undefined;
  let sourceCleanup: (() => void) = () => {};
  if (opts.configSource && opts.configSource.trim() !== "") {
    try {
      const fetched = await fetchSource({
        source: opts.configSource,
        ...(opts.configSourceBranch && { branch: opts.configSourceBranch }),
        ...(process.env.CMS_GITHUB_SOURCE_TOKEN && { token: process.env.CMS_GITHUB_SOURCE_TOKEN }),
      });
      projectDir = fetched.dir;
      sourceCleanup = fetched.cleanup;
      // For fetched sources, content dir piggybacks on cms-admin's
      // sitePaths so editor-side content overlays the cloned tree.
      contentDir = existsSync(sitePaths.contentDir) ? sitePaths.contentDir : undefined;
    } catch (err) {
      return {
        ok: false,
        error: `source-fetch failed: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - start,
      };
    }
  }

  let buildResult;
  try {
    buildResult = await buildSsrSite({
      siteId: opts.siteEntry.id,
      sha,
      projectDir,
      ...(contentDir && { contentDir }),
      targetApp,
      registryToken,
      callbackUrl,
      callbackToken,
      flyToken,
    });
  } catch (err) {
    sourceCleanup();
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  } finally {
    sourceCleanup();
  }

  if (!buildResult.success) {
    return {
      ok: false,
      error: `builder VM exited with state=${buildResult.finalState} exit=${buildResult.exitCode}`,
      durationMs: Date.now() - start,
    };
  }

  const deploy = deployImageToFly({
    appName: targetApp,
    imageTag: buildResult.imageTag,
    flyToken,
    ...(opts.configOrg && { orgSlug: opts.configOrg }),
  });
  if (!deploy.success) {
    return {
      ok: false,
      error: `image-deploy failed: ${deploy.error}`,
      imageTag: buildResult.imageTag,
      durationMs: Date.now() - start,
    };
  }

  return {
    ok: true,
    appUrl: deploy.appUrl,
    imageTag: buildResult.imageTag,
    durationMs: Date.now() - start,
  };
}
