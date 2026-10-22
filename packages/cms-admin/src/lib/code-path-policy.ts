/**
 * Security W41 C5 — the chain "upload a .ts file, then ask the server to load
 * it as a site config" ran attacker code inside cms-admin. Two links, both cut:
 *
 * 1. Uploads never accept a file the server or a browser would execute as code.
 * 2. A config the server loads (jiti) on a caller's say-so must be the ACTIVE
 *    site's own registered config. An arbitrary path is allowed only to the
 *    instance admin on a server that runs site code at all (self-hosted;
 *    webhouse.app sets CMS_SERVER_BUILDS=off).
 */
import path from "node:path";
import { serverBuildsAllowed } from "./build/server-build-policy";

/** Extensions a runtime would load as code (Node/jiti, shells, PHP, …). */
const CODE_EXT = new Set([
  ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs",
  ".php", ".phtml", ".phar", ".sh", ".bash", ".py", ".rb", ".pl", ".cgi",
  ".node", ".exe", ".bat", ".cmd", ".ps1",
]);

export function isCodeUpload(filename: string): boolean {
  return CODE_EXT.has(path.extname(filename).toLowerCase());
}

export const CODE_UPLOAD_REFUSED = "This file type cannot be uploaded (it would be code on the server).";

/**
 * May a caller have the server load `requested` as a config?
 * `activeConfigPath` = the active site's registered config (null if none).
 */
export function configLoadAllowed(
  requested: string,
  activeConfigPath: string | null,
  opts: { instanceAdmin: boolean; env?: Record<string, string | undefined> },
): boolean {
  const req = path.resolve(requested);
  if (activeConfigPath && req === path.resolve(activeConfigPath)) return true;
  return opts.instanceAdmin && serverBuildsAllowed(opts.env);
}
