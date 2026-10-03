/**
 * F206.3 — may this server run a site's own build code?
 *
 * A site's build.ts (or custom build command) is code from that site's repo.
 * Run on a shared CMS server it inherits the server's whole environment and
 * can read every tenant's files. webhouse.app therefore sets
 * CMS_SERVER_BUILDS=off (fly.toml [env]); sites build in their own repo and
 * the CMS only sends "build now" (the webhook deploy provider).
 *
 * Self-hosted cms-admin leaves it unset and keeps building as before.
 * The engine's own runBuild() is CMS code, not site code, and is not gated.
 */

export const SERVER_BUILDS_ENV = "CMS_SERVER_BUILDS";

export const SERVER_BUILD_DISABLED_MESSAGE =
  "This CMS server does not run a site's own build code (CMS_SERVER_BUILDS=off). " +
  "Build the site in its own repo and set Site Settings → Deploy to «Webhook», " +
  "so the CMS only sends the build signal.";

export class ServerBuildDisabledError extends Error {
  readonly code = "SERVER_BUILD_DISABLED";
  constructor() {
    super(SERVER_BUILD_DISABLED_MESSAGE);
    this.name = "ServerBuildDisabledError";
  }
}

export function serverBuildsAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return env[SERVER_BUILDS_ENV] !== "off";
}

export function assertServerBuildAllowed(env: Record<string, string | undefined> = process.env): void {
  if (!serverBuildsAllowed(env)) throw new ServerBuildDisabledError();
}
