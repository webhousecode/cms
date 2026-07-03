# F158 — Inline-edit connect: webhouse CMS login-confirmation screen

Story of F157 (site-wide inline editing). Approved mockup:
`/mockups/019f29da-dbf4-7643-8d53-37ceed564a57` (v2).

## Motivation

Today the pill's **"Rediger"** does a same-tab `window.location.href = connectUrl`;
`/admin/inline-edit/connect` mints the edit token and **silently 302-redirects**
back to the site with `?cms_edit=<token>`. There is no confirmation — the editor
never sees that they authenticated *into webhouse CMS*, and on a slow mint it
just looks like a blank bounce.

Christian wants the standard auth-confirmation moment (à la Claude.ai): after you
sign in, a **webhouse.app CMS-branded** screen says *"Du er logget ind — du kan
roligt lukke dette vindue nu"*, and you return to your site to edit. Branding is
webhouse CMS (gold `#f7bb2e` / dark `#0d0d0d`, the real webhouse.app icon), **not**
the consumer site's brand — because you logged into the CMS, not the site.

## Scope

- Serve a webhouse-CMS-branded confirmation page from `/admin/inline-edit/connect`
  after the token is minted, matching the approved mockup.
- Open the connect flow in a **popup window** so "luk dette vindue" is literal;
  pass the token back to the opener (site tab) via **origin-validated `postMessage`**.
- **Fallback (no naked cutover):** if the popup is blocked / there is no opener,
  keep the existing same-tab `?cms_edit=` redirect — the confirmation page then
  shows a "Tilbage til dit website →" button carrying the token.

### Non-goals

- No change to token TTL / scope / signing (F157 unchanged).
- No forced auto-close (offered as a courtesy button; browsers may ignore
  programmatic close — the user can always close the tab).
- No welcome-screen on the *site* itself (rejected mockup v1) — the confirmation
  lives on webhouse.app, the CMS.

## Architecture

**1. `@broberg/cms-inline-edit` (package).**
- On "Rediger" click: `const w = window.open(connectUrl, "wh-connect", "width=460,height=640")`.
  If `w` is null (blocked) → fall back to `window.location.href = connectUrl` (current path).
- Register a `message` listener that accepts a token ONLY when
  `event.origin === options.cmsBaseUrl` **and** `event.data?.type === "wh-inline-edit-token"`
  **and** the token's `site` claim matches `options.siteId`. Then persist to
  `localStorage[storageKey]` and `activateEditMode()` (pill appears, no reload).
- The `?cms_edit=` URL-capture path stays as the same-tab fallback.

**2. `/admin/inline-edit/connect` (cms-admin route).**
- Mint the token exactly as today (unchanged auth: `content.edit` + session).
- Instead of always `NextResponse.redirect`, return an HTML page (the mockup)
  with an inline script that:
  - Resolves `returnOrigin = new URL(returnUrl).origin`.
  - If `window.opener`: `window.opener.postMessage({type:"wh-inline-edit-token", token, site}, returnOrigin)`
    then shows *"du kan lukke dette vindue"* + a "Luk vindue" button (`window.close()`).
  - Else (no opener → same-tab): shows *"Tilbage til dit website →"* linking to
    `returnUrl + "?cms_edit=" + token` (existing capture path).
- **Security:** `postMessage` target is the specific `returnOrigin`, **never `"*"`**.
  `returnUrl` is validated to be an allowed origin (the site's `previewSiteUrl`)
  before the page is served, else 400 — a token must never be posted to an
  attacker-controlled origin.

## Acceptance criteria

1. Clicking "Rediger" on the live site opens webhouse.app's connect flow in a
   popup; if the popup is blocked it falls back to same-tab navigation.
2. After sign-in the popup shows the webhouse-CMS-branded confirmation
   (gold/dark, webhouse icon, "Du er logget ind", "du kan roligt lukke dette
   vindue nu") matching mockup v2.
3. The site tab receives the token via `postMessage` (origin-validated to
   `cmsBaseUrl`) and enters edit mode (the "Afslut redigering" pill appears)
   with no full reload.
4. Same-tab fallback: with no opener, the confirmation shows "Tilbage til dit
   website →" that returns with `?cms_edit=<token>` (F157 path preserved).
5. Security: connect posts the token only to the exact `returnUrl` origin (never
   `"*"`); the site listener rejects any message whose origin ≠ `cmsBaseUrl`.
6. Every new interactive element has a semantic `data-testid`.

## Rollout

Package bump + npm publish → cms-admin connect-route deploy (webhouse-app) →
broberg dep bump + deploy. Existing `?cms_edit=` capture stays working the whole
time (replace-then-prove, never a naked cutover).
