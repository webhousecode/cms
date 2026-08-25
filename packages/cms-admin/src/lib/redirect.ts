import { NextResponse } from "next/server";

/**
 * Redirect a browser to a path on THIS admin, without guessing our own address.
 *
 * `NextResponse.redirect(new URL(path, req.url))` looks harmless and was used
 * in eleven places. It is not: inside the Next standalone server `req.url` is
 * built from the address the process BINDS to, and the container exports
 * `HOSTNAME=0.0.0.0`. So every one of those redirects sent the visitor an
 * absolute `Location: https://0.0.0.0:3010/…` — an address no browser can
 * reach.
 *
 * Measured on production 25 Aug 2026, while chasing why the "Åbn i CMS" button
 * in a form-notification mail landed on a certificate warning:
 *
 *   GET https://webhouse.app/admin/goto/<id>
 *   → 307  location: https://0.0.0.0:3010/admin/forms/contact
 *
 * The same defect sat in the whole GitHub OAuth callback and in the
 * site-switch route, so signing in with GitHub could not complete either.
 *
 * A RELATIVE Location is valid HTTP (RFC 7231 §7.1.2) and the browser resolves
 * it against the address it actually used — which is the only address that is
 * ever right. Nothing to configure, nothing to keep in sync.
 *
 * The returned response is a plain NextResponse, so callers can still attach
 * cookies (`res.cookies.set(...)`) exactly as before.
 */
export function redirectTo(path: string, status: 307 | 308 = 307): NextResponse {
  return new NextResponse(null, { status, headers: { Location: path } });
}
