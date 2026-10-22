/**
 * Security W41 C4 — /api/mobile/preview-proxy is a LOCAL dev tool: it relays
 * the phone to a dev server bound to localhost, or serves a registered site's
 * dist/. It accepted any `?upstream=` URL and any `?dir=`, and its signed token
 * did not cover `path`, so it was an SSRF and an arbitrary-directory reader.
 *
 * Now: off entirely on a server that runs no site code (webhouse.app,
 * CMS_SERVER_BUILDS=off); otherwise upstream must be loopback, the final URL
 * must stay on that origin, and dir must be a registered site's own dist/.
 */
import path from "node:path";

const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?(\/|$)/i;

export function isLoopbackUrl(url: string): boolean {
  return LOOPBACK.test(url);
}

/** The URL to fetch for `filePath` under `upstream`, or null if it would leave upstream's origin. */
export function upstreamTarget(upstream: string, filePath: string): string | null {
  if (!isLoopbackUrl(upstream)) return null;
  let base: URL;
  try { base = new URL(upstream.endsWith("/") ? upstream : upstream + "/"); } catch { return null; }
  let target: URL;
  try {
    target = filePath === "/" ? base : new URL(filePath.replace(/^\/+/, ""), base);
  } catch { return null; }
  return target.origin === base.origin ? target.toString() : null;
}

/** dir must be exactly `<project>/dist` of a registered filesystem site. */
export function distDirAllowed(dir: string, configPaths: string[]): boolean {
  const want = path.resolve(dir);
  return configPaths
    .filter((p) => p && !p.startsWith("github://"))
    .some((p) => path.join(path.dirname(path.resolve(p)), "dist") === want);
}
