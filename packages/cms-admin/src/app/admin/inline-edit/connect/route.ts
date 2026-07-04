import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SignJWT } from "jose";
import { requirePermission } from "@/lib/permissions";
import { getActiveSiteEntry } from "@/lib/site-paths";
import { getSessionWithSiteRole } from "@/lib/require-role";
import { getSessionUser } from "@/lib/auth";
import { readSiteConfig } from "@/lib/site-config";
import { loadRegistry } from "@/lib/site-registry";
import { withSiteContext } from "@/lib/site-context";

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

const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

// F158.2 — the webhouse-CMS confirmation screen ("Du er logget ind") is a
// login acknowledgement, not a per-connect nag. We only show it when a login
// actually happened in THIS flow. Signal: a freshly-minted cms-session cookie.
// The cookie's `iat` is only set at login (and profile update) — there is no
// sliding per-request refresh — so `now - iat` under this window means "just
// logged in". A generous window covers a slow login (typing + optional TOTP).
const FRESH_LOGIN_WINDOW_SECONDS = 120;

function getJwtSecret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.CMS_JWT_SECRET ?? "cms-dev-secret-change-me-in-production",
  );
}

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
    const cfg = await readSiteConfig();
    if (cfg.previewSiteUrl && new URL(cfg.previewSiteUrl).origin === origin) return true;
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
    return NextResponse.json({ error: "site and return are required" }, { status: 400 });
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
    return NextResponse.json({ error: "site not found" }, { status: 404 });
  }

  return withSiteContext({ orgId, siteId }, async () => {
    // Permission is checked against the TARGET site (via the override) — a user
    // without content.edit on this site gets 403, so self-resolving ?site= is
    // not a privilege escalation.
    const denied = await requirePermission("content.edit");
    if (denied) return denied;

    const site = await getActiveSiteEntry();
    if (!site || site.id !== siteId) {
      return NextResponse.json({ error: "site not found" }, { status: 404 });
    }

    if (!(await isReturnAllowed(returnUrl))) {
      return NextResponse.json({ error: "return origin not allowed" }, { status: 400 });
    }

    const session = await getSessionWithSiteRole();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = Math.floor(Date.now() / 1000);

    // Did a login just happen in this flow? If the editor already had a valid
    // webhouse.app session (no login round-trip), connect silently instead of
    // showing the confirmation screen every time. `iat` comes off the raw
    // session cookie (getSessionWithSiteRole strips it).
    const rawSession = await getSessionUser(await cookies());
    const iat = (rawSession as { iat?: number } | null)?.iat ?? 0;
    const freshLogin = iat > 0 && now - iat <= FRESH_LOGIN_WINDOW_SECONDS;

    const expires = now + TTL_SECONDS;
    const token = await new SignJWT({
      sub: session.userId,
      email: session.email,
      name: session.name,
      role: session.siteRole ?? "editor",
      editSession: true,
      site: site.id,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(now)
      .setExpirationTime(expires)
      .sign(getJwtSecret());

    return new NextResponse(renderConnectWelcome({ token, returnUrl, site: site.id, freshLogin }), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  });
}

/** Serialise a value into a <script> context, neutralising </script> and HTML. */
function jsSafe(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function renderConnectWelcome(data: { token: string; returnUrl: string; site: string; freshLogin: boolean }): string {
  return `<!doctype html>
<html lang="da">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>webhouse CMS — Du er logget ind</title>
<link rel="preconnect" href="https://fonts.bunny.net" />
<link href="https://fonts.bunny.net/css?family=inter:400,500,600,700" rel="stylesheet" />
<style>
  :root{--gold:#f7bb2e;--gold-soft:rgba(247,187,46,.12);--bg:#0d0d0d;--panel:#151515;
    --panel-border:rgba(255,255,255,.08);--fg:#f4f4f5;--muted:rgba(244,244,245,.56);
    --muted-dim:rgba(244,244,245,.36);--fb:"Inter",-apple-system,BlinkMacSystemFont,sans-serif;}
  *{box-sizing:border-box;margin:0;padding:0}html,body{height:100%}
  body{font-family:var(--fb);background:var(--bg);color:var(--fg);min-height:100vh;display:flex;
    align-items:center;justify-content:center;position:relative;overflow:hidden;-webkit-font-smoothing:antialiased}
  body::before{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;
    background:radial-gradient(ellipse 52% 42% at 50% -4%, rgba(247,187,46,.14), transparent 60%)}
  .card{position:relative;z-index:1;width:min(92vw,480px);text-align:center;padding:44px 34px 30px;
    border-radius:20px;background:linear-gradient(180deg,var(--panel),#101010);border:1px solid var(--panel-border);
    box-shadow:0 30px 80px rgba(0,0,0,.5);animation:rise .55s cubic-bezier(.22,.61,.36,1) both}
  @keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
  @media (prefers-reduced-motion:reduce){.card{animation:none}}
  .brandmark{width:60px;height:60px;margin:0 auto 12px;display:block}
  .wordmark{font-size:15px;font-weight:700;letter-spacing:-.01em;color:var(--fg);margin-bottom:30px}
  .wordmark .app{color:var(--gold)}
  .check{width:60px;height:60px;margin:0 auto 22px;border-radius:50%;display:flex;align-items:center;
    justify-content:center;background:var(--gold-soft);border:1px solid rgba(247,187,46,.4);
    box-shadow:0 0 0 7px rgba(247,187,46,.05)}
  .check svg{width:28px;height:28px;stroke:var(--gold)}
  h1{font-size:24px;font-weight:600;letter-spacing:-.02em;margin-bottom:12px}
  .lead{font-size:15px;line-height:1.6;color:var(--muted);max-width:360px;margin:0 auto 22px}
  .lead b{color:var(--fg);font-weight:600}
  .note{display:flex;align-items:center;gap:9px;justify-content:center;font-size:13.5px;font-weight:500;
    color:var(--gold);background:var(--gold-soft);border:1px solid rgba(247,187,46,.22);border-radius:10px;
    padding:11px 14px;margin:0 auto 26px;max-width:380px}
  .note svg{width:16px;height:16px;flex:0 0 auto;stroke:var(--gold)}
  .btn{font-family:var(--fb);font-size:14.5px;font-weight:600;cursor:pointer;padding:0 20px;height:46px;
    border-radius:11px;display:inline-flex;align-items:center;gap:8px;border:none;text-decoration:none;
    background:var(--gold);color:#0d0d0d;transition:transform .12s ease,box-shadow .2s ease,background .2s ease;
    box-shadow:0 6px 20px rgba(247,187,46,.22)}
  .btn:hover{background:#ffc84a;transform:translateY(-1px);box-shadow:0 10px 26px rgba(247,187,46,.32)}
  .btn:hover .ar{transform:translateX(3px)}.btn:active{transform:translateY(0)}
  .btn .ar{transition:transform .18s ease}
  .foot{margin-top:24px;font-size:12px;color:var(--muted-dim)}.foot b{color:var(--gold);font-weight:500}
</style>
</head>
<body>
  <main class="card" data-testid="connect-welcome-root">
    <svg class="brandmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 335.2 338.48" aria-hidden="true">
      <path fill="#2a2a3e" d="M167.6,0C87.6,0,7.6,48,7.6,144s48,169.6,112,192c32,9.6,48-9.6,48-41.6"/>
      <path fill="#212135" d="M7.6,144c-16,48-6.4,118.4,25.6,156.8,25.6,25.6,64,38.4,86.4,35.2"/>
      <path fill="#f7bb2e" d="M167.6,0c80,0,160,48,160,144s-48,169.6-112,192c-32,9.6-48-9.6-48-41.6"/>
      <path fill="#d9a11a" d="M327.6,144c16,48,6.4,118.4-25.6,156.8-25.6,25.6-64,38.4-86.4,35.2"/>
      <path fill="#fff" d="M52.4,160c38.4-59.73,76.8-89.6,115.2-89.6s76.8,29.87,115.2,89.6c-38.4,59.73-76.8,89.6-115.2,89.6s-76.8-29.87-115.2-89.6Z"/>
      <circle fill="#f7bb2e" cx="167.6" cy="160" r="48"/>
      <circle fill="#0d0d0d" cx="167.6" cy="160" r="20.8"/>
      <circle fill="#fff" opacity=".9" cx="180.4" cy="147.2" r="8.96"/>
      <circle fill="#fff" opacity=".3" cx="158" cy="171.2" r="4.16"/>
    </svg>
    <div class="wordmark">webhouse<span class="app">.app</span></div>
    <div class="check" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
    </div>
    <h1>Du er logget ind</h1>
    <p class="lead">Du er nu forbundet til <b>webhouse CMS</b>. G&aring; tilbage til dit website og klik p&aring; en hvilken som helst tekst for at redigere den &mdash; <b>&aelig;ndringer gemmes automatisk</b>.</p>
    <div class="note" id="wh-close-note">
      <svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      Du kan roligt lukke dette vindue nu
    </div>
    <a class="btn" id="wh-return-btn" href="#" data-testid="connect-return"><span id="wh-btn-label">Tilbage til dit website</span> <span class="ar" id="wh-btn-arrow">&rarr;</span></a>
    <p class="foot">Powered by <b>@webhouse/cms</b></p>
  </main>
<script>
(function(){
  var DATA = ${jsSafe(data)};
  var returnOrigin = null;
  try { returnOrigin = new URL(DATA.returnUrl).origin; } catch (e) {}
  var opener = null;
  try { opener = window.opener; } catch (e) {}
  var hasOpener = !!opener && !!returnOrigin;

  var btn = document.getElementById("wh-return-btn");
  var label = document.getElementById("wh-btn-label");
  var arrow = document.getElementById("wh-btn-arrow");
  var note = document.getElementById("wh-close-note");
  var card = document.querySelector(".card");

  function armManualClose() {
    if (card) card.style.display = "";
    label.textContent = "Luk vindue";
    if (arrow) arrow.style.display = "none";
    btn.setAttribute("href", "#");
    btn.addEventListener("click", function (e) { e.preventDefault(); window.close(); });
  }

  if (hasOpener) {
    // The site tab needs the token either way — deliver it first.
    try { opener.postMessage({ type: "wh-inline-edit-token", token: DATA.token, site: DATA.site }, returnOrigin); } catch (e) {}

    if (!DATA.freshLogin) {
      // Already logged in — no login just happened. The site tab now shows the
      // connected pill, so this popup has nothing to confirm. Close silently.
      if (card) card.style.display = "none";
      setTimeout(function () { window.close(); }, 80);
      // If the browser refused to close the window (edge), reveal a manual close.
      setTimeout(function () { armManualClose(); }, 500);
      return;
    }

    // Fresh login — acknowledge it briefly, then auto-close (no manual step).
    armManualClose();
    setTimeout(function () { window.close(); }, 2200);
  } else {
    // Same-tab fallback: carry the token back via the F157 capture URL.
    if (note) note.style.display = "none";
    var sep = DATA.returnUrl.indexOf("?") === -1 ? "?" : "&";
    btn.setAttribute("href", DATA.returnUrl + sep + "cms_edit=" + encodeURIComponent(DATA.token));
  }
})();
</script>
</body>
</html>`;
}
