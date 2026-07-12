/**
 * Shared CORS origin matcher for the cross-origin browser routes (inline-edit
 * GET/PATCH, form submissions). Both used to inline `allowed.some(a => origin === a)`
 * — an EXACT string compare that silently failed whenever a site's
 * `previewSiteUrl` carried a trailing slash or a path (e.g.
 * "https://site.fly.dev/"), because a browser's `Origin` header is ALWAYS just
 * scheme+host+port with no trailing slash. The mismatch dropped the
 * `Access-Control-Allow-Origin` header → the browser blocked the request →
 * the inline-edit save showed a red "Fejl" pill (2026-07-12, sanneandersen).
 *
 * Compare by URL origin so a trailing slash / path in the allowed entry no
 * longer breaks the match. Falls back to exact equality for "*" or a malformed
 * entry (never throws).
 */
export function originAllowed(origin: string | null, allowed: string[]): boolean {
  if (!origin) return false;
  return allowed.some((a) => {
    if (a === "*" || a === origin) return true;
    try {
      return new URL(a).origin === origin;
    } catch {
      return false;
    }
  });
}
