import { NextRequest, NextResponse } from "next/server";
import { getServerTSafe, getRequestLocale } from "@/i18n/server";
import { type UiLocale } from "@/i18n/locale";
import { brandForRequest } from "@/lib/brand";
import { renderConnectWelcome } from "@/lib/inline-edit-connect-page";
import { cookies } from "next/headers";
import { mintEditSessionToken, isReadOnlyLensSession } from "@/lib/inline-edit-token";
import { requirePermission } from "@/lib/permissions";
import { getActiveSiteEntry } from "@/lib/site-paths";
import { getSessionWithSiteRole } from "@/lib/require-role";
import { getSessionUser } from "@/lib/auth";
import { readSiteConfig } from "@/lib/site-config";
import { loadRegistry } from "@/lib/site-registry";
import { withSiteContext } from "@/lib/site-context";
import { originAllowed, siteOriginsWithSiblings } from "@/lib/cors-origin";

/**
 * F157/F158 (site-wide) — "Log ind for at redigere" connect flow.
 *
 * `GET /admin/inline-edit/connect?site=<id>&return=<url>`
 * - Lives under /admin so proxy.ts's existing auth gate applies for free —
 *   an unauthenticated visitor is redirected to /admin/login first, then
 *   lands back here after signing in (Next.js `from` param round-trip).
 * - Gated by `content.edit` on the given site.
 * - Mints a 30-day, site-scoped (not per-document) editSession token, then
 *   (F158) serves a webhouse-CMS-branded page. Opened as a popup (window.opener
 *   present) it posts the token to the site tab via origin-validated
 *   postMessage. (F158.2) The "Du er logget ind" confirmation is a login
 *   acknowledgement, not a per-connect nag: it only lingers when a login just
 *   happened in this flow (fresh cms-session cookie). If the editor was already
 *   logged in, the popup delivers the token and closes silently — the site tab
 *   already shows the connected pill. Opened same-tab (no opener, e.g. popup
 *   blocked) it links back to the site with `?cms_edit=<token>` — the F157
 *   capture path — so nothing regresses.
 */

// F158.2 — the webhouse-CMS confirmation screen ("Du er logget ind") is a
// login acknowledgement, not a per-connect nag. We only show it when a login
// actually happened in THIS flow. Signal: a freshly-minted cms-session cookie.
// The cookie's `iat` is only set at login (and profile update) — there is no
// sliding per-request refresh — so `now - iat` under this window means "just
// logged in". A generous window covers a slow login (typing + optional TOTP).
const FRESH_LOGIN_WINDOW_SECONDS = 120;

/** returnUrl must be the site's own origin — never post a token to an
 *  attacker-controlled origin. Source of truth is site-config previewSiteUrl. */
async function isReturnAllowed(returnUrl: string): Promise<boolean> {
  let origin: string;
  try {
    origin = new URL(returnUrl).origin;
  } catch {
    return false;
  }
  try {
    // EVERY host the site answers on — not previewSiteUrl alone. A site has a
    // staging address AND a live domain (and often a www sibling) at the same
    // time; reading one field made the gate refuse the site's own domain the
    // day it changed. sanneandersen.dk, launch day 2026-08-26.
    const cfg = await readSiteConfig();
    if (originAllowed(origin, siteOriginsWithSiblings(cfg))) return true;
  } catch {
    /* no site config */
  }
  if (process.env.NODE_ENV !== "production" && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
    return true;
  }
  return false;
}

export async function GET(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get("site");
  const returnUrl = request.nextUrl.searchParams.get("return");
  if (!siteId || !returnUrl) {
    return NextResponse.json({ error: (await getServerTSafe())("pages.inlineEditConnect.siteAndReturnRequired") }, { status: 400 });
  }

  // F158.1 — self-resolve ?site=. proxy.ts only injects the cms-active-site
  // cookie for /api/* paths, not /admin/*, so without this the flow depended on
  // the editor's active workspace already being the target site (→ 400). Look
  // up the org that owns this site and run the whole handler under that site
  // context, so requirePermission/getActiveSiteEntry/readSiteConfig all resolve
  // to the TARGET site regardless of the caller's active workspace.
  const registry = await loadRegistry();
  let orgId: string | undefined;
  for (const org of registry?.orgs ?? []) {
    if (org.sites.some((s) => s.id === siteId)) {
      orgId = org.id;
      break;
    }
  }
  if (!orgId) {
    return NextResponse.json({ error: (await getServerTSafe())("pages.inlineEditConnect.siteNotFound") }, { status: 404 });
  }

  return withSiteContext({ orgId, siteId }, async () => {
    // Permission is checked against the TARGET site (via the override) — a user
    // without content.edit on this site gets 403, so self-resolving ?site= is
    // not a privilege escalation.
    const denied = await requirePermission("content.edit");
    if (denied) return denied;

    const site = await getActiveSiteEntry();
    if (!site || site.id !== siteId) {
      return NextResponse.json({ error: (await getServerTSafe())("pages.inlineEditConnect.siteNotFound") }, { status: 404 });
    }

    if (!(await isReturnAllowed(returnUrl))) {
      return NextResponse.json({ error: (await getServerTSafe())("pages.inlineEditConnect.returnNotAllowed") }, { status: 400 });
    }

    const session = await getSessionWithSiteRole();
    if (!session) {
      return NextResponse.json({ error: (await getServerTSafe())("pages.inlineEditConnect.unauthorized") }, { status: 401 });
    }

    const now = Math.floor(Date.now() / 1000);

    // Did a login just happen in this flow? If the editor already had a valid
    // webhouse.app session (no login round-trip), connect silently instead of
    // showing the confirmation screen every time. `iat` comes off the raw
    // session cookie (getSessionWithSiteRole strips it).
    const rawSession = await getSessionUser(await cookies());
    const iat = (rawSession as { iat?: number } | null)?.iat ?? 0;
    const freshLogin = iat > 0 && now - iat <= FRESH_LOGIN_WINDOW_SECONDS;

    // F157.17 — the same refusal as the headless door. This handler is a GET,
    // so proxy.ts's method guard (POST/PUT/PATCH/DELETE) never sees it: the
    // gate that should stop this is the gate that opens the door. Measured
    // against production 7 Sep 2026 — a read-only Lens cookie was refused a
    // direct PATCH (403) and granted a writing token here, four calls apart.
    if (isReadOnlyLensSession(rawSession)) {
      return NextResponse.json(
        { error: (await getServerTSafe())("pages.inlineEditConnect.lensReadOnly") },
        { status: 403 },
      );
    }

    const { token } = await mintEditSessionToken({
      userId: session.userId,
      email: session.email,
      name: session.name,
      role: session.siteRole ?? "editor",
      siteId: site.id,
      lens: rawSession?.lens === true,
      lensWrite: rawSession?.lensWrite === true,
    });

    // F210 white-label: the page a customer's editor sees carries the brand of
    // the address they signed in on, in their admin language.
    const brand = brandForRequest(request.headers);
    let locale: UiLocale = "en";
    try { locale = await getRequestLocale(brand.defaultLocale); } catch { /* no request scope */ }
    const page = renderConnectWelcome({ token, returnUrl, site: site.id, freshLogin }, brand, locale);
    return new NextResponse(page, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  });
}
