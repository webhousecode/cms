/**
 * F158/F210 — the "you're signed in" page the live-edit login shows. Rendered as
 * standalone HTML by app/admin/inline-edit/connect/route.ts, in the brand of the
 * address the editor signed in on and in their admin language.
 */
/* i18n-ignore-file: HTML markup, CSS and the brand mark only — every visible text comes from t() */
import { getT, type UiLocale } from "@/i18n/locale";
import { isDefaultBrand, readableOn, brandFont, type BrandPack } from "@/lib/brand";

/** Serialise a value into a <script> context, neutralising </script> and HTML. */
function jsSafe(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/** A plain #rrggbb or the fallback — never raw CSS. */
function hexOr(value: string, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

/** Escape text for an HTML text/attribute context. */
function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderConnectWelcome(
  data: { token: string; returnUrl: string; site: string; freshLogin: boolean },
  brand: BrandPack,
  locale: UiLocale,
): string {
  const t = getT(locale);
  const own = isDefaultBrand(brand);
  // The card is dark, so a customer brand uses its dark-theme colour.
  // Both land inside <style>: only a plain #rrggbb may get there, same rule as brandCss.
  const accent = own ? "#f7bb2e" : hexOr(brand.colorDark ?? brand.color, "#f7bb2e");
  const accentFg = own ? "#0d0d0d" : hexOr(brand.colorDarkForeground ?? readableOn(accent), "#0d0d0d");
  const font = brandFont(brand);
  const fontLink = font
    ? `<link href="${esc(font.stylesheet)}" rel="stylesheet" />`
    : `<link rel="preconnect" href="https://fonts.bunny.net" />\n<link href="https://fonts.bunny.net/css?family=inter:400,500,600,700" rel="stylesheet" />`;
  const fontFamily = font ? `"${font.family}"` : `"Inter"`;
  const logo = own
    ? WEBHOUSE_MARK
    : `<img class="brandlogo" src="${esc(brand.logo.dark)}" alt="${esc(brand.name)}" />`;
  const lead = esc(t("pages.inlineEditConnect.lead", { product: "\u0000", autosave: "\u0001" }))
    .replace("\u0000", `<b>${esc(brand.name)}</b>`)
    .replace("\u0001", `<b>${esc(t("pages.inlineEditConnect.autosave"))}</b>`);
  const labels = { closeWindow: t("pages.inlineEditConnect.closeWindow") };
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(t("pages.inlineEditConnect.pageTitle", { product: brand.name }))}</title>
${fontLink}
<style>
  :root{--gold:${accent};--gold-fg:${accentFg};--gold-soft:color-mix(in srgb,var(--gold) 12%,transparent);--bg:#0d0d0d;--panel:#151515;
    --panel-border:rgba(255,255,255,.08);--fg:#f4f4f5;--muted:rgba(244,244,245,.56);
    --muted-dim:rgba(244,244,245,.36);--fb:${fontFamily},-apple-system,BlinkMacSystemFont,sans-serif;}
  *{box-sizing:border-box;margin:0;padding:0}html,body{height:100%}
  body{font-family:var(--fb);background:var(--bg);color:var(--fg);min-height:100vh;display:flex;
    align-items:center;justify-content:center;position:relative;overflow:hidden;-webkit-font-smoothing:antialiased}
  body::before{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;
    background:radial-gradient(ellipse 52% 42% at 50% -4%, color-mix(in srgb,var(--gold) 14%,transparent), transparent 60%)}
  .card{position:relative;z-index:1;width:min(92vw,480px);text-align:center;padding:44px 34px 30px;
    border-radius:20px;background:linear-gradient(180deg,var(--panel),#101010);border:1px solid var(--panel-border);
    box-shadow:0 30px 80px rgba(0,0,0,.5);animation:rise .55s cubic-bezier(.22,.61,.36,1) both}
  @keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
  @media (prefers-reduced-motion:reduce){.card{animation:none}}
  .brandmark{width:60px;height:60px;margin:0 auto 12px;display:block}
  .brandlogo{display:block;height:44px;max-width:220px;margin:0 auto 30px;object-fit:contain}
  .wordmark{font-size:15px;font-weight:700;letter-spacing:-.01em;color:var(--fg);margin-bottom:30px}
  .wordmark .app{color:var(--gold)}
  .check{width:60px;height:60px;margin:0 auto 22px;border-radius:50%;display:flex;align-items:center;
    justify-content:center;background:var(--gold-soft);border:1px solid color-mix(in srgb,var(--gold) 40%,transparent);
    box-shadow:0 0 0 7px color-mix(in srgb,var(--gold) 5%,transparent)}
  .check svg{width:28px;height:28px;stroke:var(--gold)}
  h1{font-size:24px;font-weight:600;letter-spacing:-.02em;margin-bottom:12px}
  .lead{font-size:15px;line-height:1.6;color:var(--muted);max-width:360px;margin:0 auto 22px}
  .lead b{color:var(--fg);font-weight:600}
  .note{display:flex;align-items:center;gap:9px;justify-content:center;font-size:13.5px;font-weight:500;
    color:var(--gold);background:var(--gold-soft);border:1px solid color-mix(in srgb,var(--gold) 22%,transparent);border-radius:10px;
    padding:11px 14px;margin:0 auto 26px;max-width:380px}
  .note svg{width:16px;height:16px;flex:0 0 auto;stroke:var(--gold)}
  .btn{font-family:var(--fb);font-size:14.5px;font-weight:600;cursor:pointer;padding:0 20px;height:46px;
    border-radius:11px;display:inline-flex;align-items:center;gap:8px;border:none;text-decoration:none;
    background:var(--gold);color:var(--gold-fg);transition:transform .12s ease,box-shadow .2s ease,background .2s ease;
    box-shadow:0 6px 20px color-mix(in srgb,var(--gold) 22%,transparent)}
  .btn:hover{filter:brightness(1.08);transform:translateY(-1px);box-shadow:0 10px 26px color-mix(in srgb,var(--gold) 32%,transparent)}
  .btn:hover .ar{transform:translateX(3px)}.btn:active{transform:translateY(0)}
  .btn .ar{transition:transform .18s ease}
  .foot{margin-top:24px;font-size:12px;color:var(--muted-dim)}.foot b{color:var(--gold);font-weight:500}
</style>
</head>
<body>
  <main class="card" data-testid="connect-welcome-root">
    ${logo}
    <div class="check" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
    </div>
    <h1>${esc(t("pages.inlineEditConnect.heading"))}</h1>
    <p class="lead">${lead}</p>
    <div class="note" id="wh-close-note">
      <svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      ${esc(t("pages.inlineEditConnect.closeNote"))}
    </div>
    <a class="btn" id="wh-return-btn" href="#" data-testid="connect-return"><span id="wh-btn-label">${esc(t("pages.inlineEditConnect.backToSite"))}</span> <span class="ar" id="wh-btn-arrow">&rarr;</span></a>
    ${own ? `<p class="foot">${esc(t("pages.inlineEditConnect.poweredBy", { product: "\u0000" })).replace("\u0000", "<b>@webhouse/cms</b>")}</p>` : ""}
  </main>
<script>
(function(){
  var DATA = ${jsSafe(data)};
  var LABELS = ${jsSafe(labels)};
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
    label.textContent = LABELS.closeWindow;
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

/** webhouse's own mark + wordmark — shown only on webhouse's own brand. */
const WEBHOUSE_MARK = `<svg class="brandmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 335.2 338.48" aria-hidden="true">
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
    <div class="wordmark">webhouse<span class="app">.app</span></div>`; // i18n-ignore: brand mark markup
