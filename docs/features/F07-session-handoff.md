# F07 Mobile App — Session Handoff (2026-04-09)

> **For the next Claude Code session.** Read this + CLAUDE.md + F07-phase-1-plan.md + packages/cms-mobile/README.md before doing anything.

## What exists right now

`packages/cms-mobile/` is a **working native mobile app** (Capacitor 8 + React 19 + Vite + Tailwind) that runs on both iOS simulator and real iPhone 14 Pro. It is NOT a WebView wrapper — it's a first-class native app with its own UI that talks to any cms-admin server via `/api/mobile/*` JSON API with Bearer JWT auth.

### What works end-to-end (verified on real iPhone 14 Pro)

- **QR pairing login** — live camera scanner (getUserMedia + jsQR) reads QR from desktop CMS admin (Account → Mobile tab), exchanges pairing token for JWT, lands on Home
- **Home screen** — gravatar, org dropdown, site search, site list with chevrons
- **Site screen** — preview iframe (for sites with previewUrl), curation queue placeholder, drafts placeholder
- **Settings** — push topic toggles (6 topics), push permission status, sign out
- **Swipe-back** — swipe from left edge to go back (Site → Home, Settings → Home)
- **Chat FAB** — bottom-right on all authenticated screens (placeholder for Phase 6 F107)
- **App icon** — Concept A (eye on #0D0D0D) at all iOS + Android sizes

### Key architecture decisions locked in

1. **BYO server URL** — user enters their CMS server URL on first launch (like WordPress mobile). No hardcoded server.
2. **Bearer JWT, never cookies** — all `/api/mobile/*` endpoints auth via Authorization header
3. **CapacitorHttp MUST be enabled** — `plugins.CapacitorHttp.enabled: true` in capacitor.config.ts. Without it, WKWebView's fetch ignores ATS and silently fails on self-signed certs / LAN IPs.
4. **Server-agnostic** — cms-admin never assumes a specific bundle id, version, or mobile endpoint. Hard rule in CLAUDE.md.
5. **Zero Swift, zero Kotlin** — all Phase 1-2 code is TypeScript. Native plugins are cross-platform.
6. **LAN IP rewrite** — `/api/mobile/pair` and `/api/mobile/me` auto-rewrite localhost URLs to Mac's LAN IP so phones can reach the dev server.

### Commits (9 total, all on main)

```
44f2cd6  Phase 1 scaffold (114 files)
ba05839  Phase 1 e2e (CapacitorHttp + auto-login)
ed3c127  Phase 1.5 (ScreenHeader, FAB, preview, org dropdown, gravatar)
bdbe0dd  Phase 2 push infrastructure
333cb9a  Settings + site search + avatar menu
3c4b6ce  Live QR scanner + LAN IP pairing + device cert
47c1ecb  Text updates
1922b18  Preview localhost→LAN rewrite + role fix
3b79d43  Swipe-back, preview placeholder, GoogleService-Info.plist, push entitlement
```

### Firebase / Push status

- GCP project `webhouse-app` created via gcloud CLI (account: webhouseplay@gmail.com)
- cb@webhouse.dk added as editor + firebase.admin
- iOS app `app.webhouse.cms` registered in Firebase
- Service account `webhouse-app-fcm` with roles/firebase.admin
- APNs .p8 key (AuthKey_VMU4Z8UJ9Z, Team 7NAG4UJCT9) uploaded to Firebase Cloud Messaging
- GoogleService-Info.plist in ios/App/App/
- App.entitlements with aps-environment=development
- VAPID keys generated for web push
- `firebase-admin` + `web-push` installed in cms-admin
- **NOT YET TESTED:** actual push delivery to device (token registration not yet confirmed)

### App Store Connect API key (WebHouse team)

- Key ID: `62YPBGB98M`
- Issuer ID: `69a6de6f-47e7-47e3-e053-5b8c7c11a4d1`
- Role: Admin
- .p8 at: `packages/cms-mobile/certs/AuthKey_62YPBGB98M.p8` + iCloud backup
- Env vars: ASC_API_KEY_ID, ASC_API_ISSUER_ID, ASC_API_KEY_PATH in cms-admin .env.local

### iPhone deployment recipe

```bash
# Build + deploy to connected iPhone 14 Pro
cd packages/cms-mobile
pnpm build && npx cap sync ios
cd ios/App && xcodebuild -scheme App \
  -destination "id=00008120-001678921E60C01E" \
  -allowProvisioningUpdates \
  -derivedDataPath ../DerivedData/device build
xcrun devicectl device install app \
  --device 00008120-001678921E60C01E \
  ../DerivedData/device/Build/Products/Debug-iphoneos/App.app

# Auto-login on simulator
pnpm sim:login  # or pnpm wha:login from root
```

### Dev cert note

cms-admin may be running HTTP (not HTTPS) — user was considering switching to simplify dev. The mobile app doesn't care — it uses whatever protocol is in the URL. If still HTTPS with mkcert: the mkcert root CA is installed + trusted on the iPhone 14 Pro (Settings → Certificate Trust Settings → mkcert ON). The cert must include the Mac's current LAN IP as a SAN — regenerate with `mkcert localhost 127.0.0.1 <LAN_IP>` if IP changes.

## What to build next (prioritized)

### 1. Pull-to-refresh (MUST be native-feeling)
Previous attempt with manual touch listeners was terrible and rejected. Research fysiodk's pattern (`/Users/cb/Apps/webhouse/fysiodk-aalborg-sport/`) or use framer-motion drag with spring physics. Trigger: `queryClient.invalidateQueries(["me"])`. **Do NOT ship another hacky PTR.** See memory `feedback_ptr_must_be_native.md`.

### 2. sirv preview proxy
`GET /api/mobile/preview/:siteId/*` → relay to the internal sirv instance for that site. This gives preview for ALL sites (even those without previewUrl) using the same mechanism as CMS admin web. Eliminates the "No preview configured" placeholder.

### 3. Push notification end-to-end test
GoogleService-Info.plist + App.entitlements are in the build. Next step: open app on iPhone → wait for FCM token registration → verify token appears in `_data/device_tokens.json` → fire test push via `curl /api/mobile/push/test` → notification appears on lock screen. Test each topic type from Settings toggles.

### 4. Live + Preview dual URL
Under the preview card on Site screen, show buttons for both "Open Live" and "Open Preview" (different URLs). Requires adding `liveUrl` field to the site registry or deriving it from existing data.

### 5. Content editing (Phase 3+)
User explicitly stated: "Vi skal have 100% redigering af ALT fra mobilen pånær 1000 settings." Mobile is a full editor for content — composite editing of pages, posts, collections. Schema editor and complex settings stay desktop-only. This is the EPIC vision, not just a viewer.

### 6. Proper Playwright portal automation
Apple portal operations (APNs key upload, device registration, app creation) should be automated via Playwright scripts in `packages/cms-mobile/scripts/portal-automation/`. Firebase Console APNs upload has no API — must use Playwright. User explicitly called out manual portal work as a bug.

## Hard-learned lessons (saved as memories)

1. **CapacitorHttp is mandatory** — WKWebView's fetch ignores Info.plist ATS. Enable `CapacitorHttp` on day one.
2. **iOS sim has no @ key** — every Capacitor app needs `pnpm sim:login` auto-login script.
3. **Pull-to-refresh must be native** — no hacky touch listeners. Research before implementing.
4. **mkcert certs need LAN IP as SAN** — `mkcert localhost 127.0.0.1 <ip>` for device testing. Or just use HTTP.
5. **@capacitor-mlkit/barcode-scanning is NOT SPM-compatible** — replaced with getUserMedia + jsQR live scanner.
6. **Safari won't auto-open custom URL schemes from address bar** — need an HTML page with `<a href="webhouseapp://...">` link, or Universal Links.
7. **NSAllowsArbitraryLoads relaxes ATS but does NOT bypass SSL cert validation** — certs must still be trusted via root CA or NSExceptionDomains.
