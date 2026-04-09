# F07 Mobile App — Session Handoff #2 (2026-04-09 evening)

> **For the next Claude Code session.** Read this + CLAUDE.md before doing anything.

## What was built today (Session 2)

This session delivered native PTR, swipe-back navigation, preview for all sites, push notifications end-to-end, access tokens, and significant UX polish.

### Native Pull-to-Refresh
- **WebhouseViewController.swift** — custom CAPBridgeViewController subclass
- Native UIView indicator (SF Symbol `arrow.clockwise` in gold #F7BB2E) rendered on UIWindow
- UIPanGestureRecognizer detects pull-down gesture (works with `overflow: hidden` on body)
- Rotates with finger, spins during refresh, fades out
- Double haptic tap (`UIImpactFeedbackGenerator .heavy`) on trigger
- KVO on scrollView.contentOffset tracks pull progress
- JS hook `usePullToRefresh` invalidates TanStack Query + clears probe cache

### Swipe-Back Navigation
- **NavigationStack.tsx** — renders Home underneath child screens with parallax (-80px → 0)
- Dim overlay fades as front screen slides right
- Shadow on left edge of front screen
- Edge swipe detection (28px from left, horizontal lock, 35% threshold)
- Instant navigation on release (no animation delay)
- Replaces old `useSwipeBack` hook (hard navigate, no visual)

### Preview for ALL Sites (29/29)
- **preview-proxy endpoint** (`/api/mobile/preview-proxy`) — two modes:
  - `upstream` — proxies to localhost dev servers (phone can't reach them directly)
  - `dir` — starts sirv on-demand for dist/ directories
- **Signed URL tokens** (`preview-token.ts`) — HMAC-signed `tok=` parameter for iframe auth (iframes can't send Bearer headers)
- `/api/mobile/me` returns previewUrl for every site:
  - External URLs (Vercel, Netlify) pass through directly
  - Localhost URLs proxied through cms-admin
  - Sites without previewUrl get on-demand sirv from dist/
- **Live URLs** resolved from `deployCustomDomain` / `deployProductionUrl` in site config
- Preview card prefers liveUrl (all resources load correctly from same origin)
- SitePreviewFullscreen also uses liveUrl
- Probe cache cleared on PTR

### Push Notifications — End-to-End Verified
- **Firebase SDK** added via SPM (firebase-ios-sdk v11+)
- **AppDelegate.swift**: `FirebaseApp.configure()` + APNs→FCM token exchange via NotificationCenter (fysiodk pattern)
- **GoogleService-Info.plist** added to PBXResourcesBuildPhase (was in directory but not in Xcode build → crashed)
- **APNs key**: `VJX23AN5WB` (Team 7NAG4UJCT9) — uploaded to Firebase Console as BOTH Development AND Production
- **Service account**: `firebase-adminsdk-fbsvc@webhouse-app.iam.gserviceaccount.com` (default, not custom)
- **Token registration**: Force Register button in Settings, two-phase (pending token in localStorage → POST to server after login)
- **Badge**: `@capawesome/capacitor-badge` — set via APNs payload, cleared on app open
- **Event-driven push**: `fireDeployEvent` and `fireAgentEvent` in webhook-events.ts now call `broadcastPush()` — sends to all users with registered tokens, respects per-user topic preferences
- **Push setup manuskript**: `docs/guides/push-notification-setup.md` — complete verified guide with common mistakes table

### Access Tokens
- **Token store** (`access-tokens.ts`) — SHA-256 hashed, `_data/access-tokens.json`
- Format: `wh_<64 hex chars>` — recognizable in logs and secret scanners
- **API**: `/api/admin/access-tokens` — POST (create), GET (list), DELETE (revoke)
- **Middleware** (`proxy.ts`) — accepts `Bearer wh_*` tokens on all `/api/admin/*` routes, mints short-lived JWT
- **UI**: Account Preferences → Access Tokens tab — generate, copy (shown once), revoke with inline confirm
- Scope model defined (admin, content:read, content:write, deploy, media) — UI selector not yet implemented

### UX Polish
- **Login** simplified to QR-only (removed email/password tab)
- **Homescreen name** changed to "CMS" (CFBundleDisplayName)
- **Input component** gains `onClear` prop (× button)
- **Onboarding** URL field starts empty (no hardcoded https://localhost)
- **Glass overlay** on org selector dropdown (backdrop-filter blur)
- **Settings** cleaned up: no profile card, collapsible push section, no debug panel
- **clearAllAuth** now wipes server URL + all prefs (clean sign-out)
- **sim-login.mjs** defaults to HTTP
- **ChatFab** uses `translateZ(0)` for stable fixed positioning

## Key files changed

| File | What |
|------|------|
| `ios/App/App/WebhouseViewController.swift` | Native PTR indicator + KVO |
| `ios/App/App/AppDelegate.swift` | Firebase init + APNs→FCM exchange |
| `ios/App/App.xcodeproj/project.pbxproj` | Firebase SPM + GoogleService-Info in resources |
| `src/components/NavigationStack.tsx` | Swipe-back with Home underneath |
| `src/components/RefreshIndicator.tsx` | No-op (native UIView handles it) |
| `src/components/SitePreview.tsx` | Probe cache clear export |
| `src/screens/Site.tsx` | liveUrl preference + Preview/Live buttons |
| `src/screens/SitePreviewFullscreen.tsx` | liveUrl preference |
| `src/screens/Settings.tsx` | Collapsible push, no debug |
| `src/screens/Login.tsx` | QR-only |
| `src/screens/Onboarding.tsx` | Empty URL field |
| `src/lib/bridge.ts` | Badge, push debug, force register |
| `src/lib/use-pull-to-refresh.ts` | Clears probe cache |
| `src/App.tsx` | NavigationStack routing |
| `cms-admin/src/lib/access-tokens.ts` | Token store |
| `cms-admin/src/lib/preview-token.ts` | Signed URL tokens for iframe |
| `cms-admin/src/lib/push-send.ts` | broadcastPush() |
| `cms-admin/src/lib/webhook-events.ts` | Push on deploy/agent events |
| `cms-admin/src/proxy.ts` | wh_* Bearer token auth |
| `cms-admin/src/app/api/mobile/me/route.ts` | Preview proxy URLs + liveUrl from config |
| `cms-admin/src/app/api/mobile/preview-proxy/route.ts` | On-demand sirv + upstream proxy |
| `cms-admin/src/app/api/mobile/probe-url/route.ts` | LAN→localhost rewrite |
| `cms-admin/src/app/api/admin/access-tokens/route.ts` | Token CRUD API |
| `cms-admin/src/components/settings/access-tokens-panel.tsx` | Token UI |

## Hard-learned lessons (this session)

1. **`overflow: hidden` on body blocks WKWebView scrollView bounce** — UIRefreshControl and KVO on contentOffset stop working. Use UIPanGestureRecognizer instead.
2. **Firebase `third-party-auth-error` = APNs key problem, not service account** — check `ApnsError: InvalidProviderToken` in the detailed response.
3. **BOTH Development AND Production APNs keys required in Firebase** — dev builds use `aps-environment=development`. Production-only key = silent failure.
4. **Use the default `firebase-adminsdk-*` service account** — custom accounts with `roles/firebase.admin` lack FCM send permission.
5. **GoogleService-Info.plist must be in PBXResourcesBuildPhase** — just existing in the directory is NOT enough. Firebase crashes at runtime.
6. **Apple Developer key names cannot contain dots** — `webhouse.app APNs` is rejected, `webhouse app APNs` works.
7. **APNs .p8 keys are created under Apple Developer → Keys** — NOT generated by Firebase or Xcode. Must have "Apple Push Notifications service (APNs)" checked.
8. **Capacitor `triggerWindowJSEvent` uses `Event`, not `CustomEvent`** — data properties are copied directly onto the Event object, not onto `.detail`.
9. **`position: fixed` in WKWebView moves during scrollView bounce** — use `overflow: hidden` on body + internal scroll containers, or use `translateZ(0)` hack.
10. **Probe cache persists stale results** — must clear on PTR or the old failed URLs never re-probe.
11. **When giving manual portal instructions, provide ALL values** (Key ID, Team ID, file path) in one message. Never make the user ask.
12. **Document mistakes as they happen** — corrections are essential for reproducible manuskripts.

## Firebase / Push credentials

- **Firebase project**: `webhouse-app` (GCP project number: 656481894508)
- **APNs key**: `VJX23AN5WB` (Team 7NAG4UJCT9), file at `packages/cms-mobile/certs/AuthKey_VJX23AN5WB.p8`
- **Service account**: `firebase-adminsdk-fbsvc@webhouse-app.iam.gserviceaccount.com`
- **Service account key**: `/tmp/firebase-adminsdk-key.json` (also update .env.local if regenerated)
- **VAPID keys**: in `packages/cms-admin/.env.local`
- **Access token** (Claude Code): `wh_f82208282421f03af5bb4a0b4b53d988b80a261035671c8f3bd73c9d8d9cf523` — scope: admin

## What to build next (prioritized)

### 1. Content Editing (Phase 3+)
User quote: "Vi skal have 100% redigering af ALT fra mobilen pånær 1000 settings." Mobile is a FULL editor for content — composite editing of pages, posts, collections. Schema editor and complex settings stay desktop-only.

### 2. Multi-Server Support in Settings
Like WordPress app — add/switch CMS servers. Currently only one server URL stored. Settings should show list of servers, active indicator, add new via QR or URL.

### 3. Push from More Event Types
Wire `broadcastPush()` into: curation_pending, link_check_failed, scheduled_publish events. Currently only deploy + agent events send push.

### 4. QR Pairing Reliability
Pairing via QR works intermittently — sometimes fails first try. Needs investigation. The deep link handler or token exchange has a timing issue.

### 5. Phase 8 BLOCKER: Remove NSAllowsArbitraryLoads
`preflight-release.sh` gate blocks App Store submission if Info.plist contains NSAllowsArbitraryLoads. Must be removed and all HTTP connections secured before release.

## iPhone deployment recipe

```bash
cd packages/cms-mobile
pnpm build && npx cap sync ios
cd ios/App && xcodebuild -scheme App \
  -destination "id=00008120-001678921E60C01E" \
  -allowProvisioningUpdates \
  -derivedDataPath ../DerivedData/device build
xcrun devicectl device install app \
  --device 00008120-001678921E60C01E \
  ../DerivedData/device/Build/Products/Debug-iphoneos/App.app

# Sim auto-login (uses HTTP, auto-detects LAN IP)
pnpm sim:login
```

## API testing with access token

```bash
# Deploy
curl -X POST http://localhost:3010/api/admin/deploy \
  -H "Authorization: Bearer wh_f822..." \
  -H "Cookie: cms-active-org=webhouse; cms-active-site=webhouse-site"

# Send test push
curl -X POST http://localhost:3010/api/mobile/push/test \
  -H "Authorization: Bearer <mobile-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","body":"Push works"}'
```
