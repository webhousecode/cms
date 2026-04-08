# F07 Phase 1 — MVP Native Shell + Auth · Implementation Plan

> **Status:** Approved 2026-04-08, in execution
> **Parent:** [`F07-mobile-cocpit-master-plan.md`](F07-mobile-cocpit-master-plan.md)
> **Goal:** A first-class native `webhouse.app` mobile app (Capacitor + React + Vite) that boots on iOS sim, lets a user enter their CMS server URL, logs in via QR or email, unlocks via biometrics on relaunch, and lands on a real native Home screen showing the user + their sites via API.

## Architecture — first-class native, not a WebView wrapper

This is **not** fysiodk's pattern (Next.js PWA wrapped in Capacitor pointing at a remote URL). webhouse.app is a **standalone native product** with its own UI, its own UX, its own features. It talks to cms-admin via JSON API only. Like Linear mobile vs Linear web: same backend, distinct product.

**Concretely:**
- Capacitor wraps a **Vite-built React SPA** bundled into the IPA/AAB
- `webDir` points at `dist/` (Vite output) — there is **no remote URL**, **no `server.url` in capacitor.config.ts**
- All UI is native-feeling React components (Tailwind for styling, framer-motion for gestures)
- All data flows through a typed API client (`src/api/client.ts`) hitting `<server>/api/mobile/*` endpoints
- JWT stored in Capacitor Preferences (Keychain on iOS, EncryptedSharedPreferences on Android via the plugin)
- Bearer token in `Authorization` header — no cookies, no CORS gymnastics
- Native plugins (biometric, push, deep links, splash, status bar, QR scan) come from existing cross-platform Capacitor plugins — **zero Swift/Kotlin in Phase 1**

**What it has that web doesn't:**
- Biometric unlock
- QR-based pairing
- (Phase 2+) push notifications, voice dictation, camera→AI alt-text, swipe curation, deep link from notification

**What it explicitly will NOT have:**
- Schema editor, block editor, settings screens — those stay in cms-admin web
- Anything that doesn't make sense as one-handed touch UI
- Wholesale port of cms-admin features

## Stack

| Layer | Choice | Why |
|---|---|---|
| Native shell | Capacitor 8 | Proven; one TS codebase → iOS + Android; rich plugin ecosystem |
| Build tool | Vite 5 | Fastest HMR; smallest static bundle; ESM-native |
| UI framework | React 19 | Same mental model as cms-admin; zero ecosystem friction; type-share with `@webhouse/cms` |
| Styling | Tailwind v4 | Utility-first; small runtime; matches user's preferred stack |
| Animations / gestures | framer-motion | Industry-standard swipe gestures (needed for Phase 3 curation) |
| Server state | TanStack Query | Caching, retries, background refetch — gold standard |
| Router | wouter | 1.5kb; enough for ~15 screens |
| Forms | React Hook Form + Zod | Same as user's other projects |

**Bundle target for Phase 1:** ≤150 KB gzipped (well within IPA size budget).

## Locked decisions

| Topic | Value |
|---|---|
| App Store name | **webhouse.app** |
| Display name (home screen) | **webhouse.app** |
| Bundle id (iOS) / package (Android) | `app.webhouse.cms` |
| URL scheme | `webhouseapp://` |
| Package location | `packages/cms-mobile/` |
| pnpm scripts | `webhouse.app:ios` / `webhouse.app:android` (fallback `wha:ios`/`wha:android`) |
| Apple team | WebHouse — Team ID `7NAG4UJCT9` |
| Google Play | WebHouse Org — Account ID `6382683137484415512` |
| Firebase project | New: `webhouse-app` (Phase 2, not Phase 1) |
| Demo CMS for Apple review (Phase 8) | `demo.webhouse.app` (server) + `https://cbroberg.github.io/agentic-cms-demo-site/` (managed site) |
| App icon / splash | Concept A — eye on `#0D0D0D`, wordmark in splash only |
| Purpose string language | English base + Danish (`da.lproj/InfoPlist.strings`) localized override |
| Native code in Phase 1 | **Zero Swift, zero Kotlin** — all plugins are cross-platform |

## Hard rule (added to CMS `CLAUDE.md` as part of Phase 1)

> **Mobile-appen er server-agnostisk.** cms-admin må ALDRIG skrive kode der antager en bestemt mobile bundle id, app version eller mobil endpoint. Alle mobil-relaterede endpoints (`/api/mobile/*`) skal acceptere ANY bundle id, validere session via Bearer JWT i `Authorization` header (ikke cookies), og returnere JSON. Det betyder vi kan whitelabel mobilappen senere uden at røre cms-admin.

## Phase 1 user flow

1. **First launch** → Onboarding screen: "Enter your CMS server URL" (e.g. `https://demo.webhouse.app`)
2. App calls `GET <url>/api/mobile/ping` to validate the URL points at a real CMS, stores it in Preferences
3. Navigates to **Login screen** with two tabs:
   - **QR** (primary) — desktop CMS admin shows a QR at `/admin/account/mobile-pairing`; mobile scans → exchanges pairing token for JWT
   - **Email/password** (fallback) — POST to `<server>/api/auth/login` (existing endpoint), receives JWT
4. After successful auth: prompt "Enable Face ID for next launch?"
5. Lands on **Home screen** (native React UI) showing:
   - Avatar + name
   - Server URL the user is connected to
   - List of orgs/sites the user has access to
   - "Curation queue: N pending" badge (real data from existing endpoint)
   - Logout button + settings gear
   - Phase placeholder: "Dashboard arrives in Phase 4"
6. **2nd launch** → biometric prompt → silent re-auth via stored JWT → straight to Home

The Home screen is a **real native screen**, not a WebView. It proves the entire architecture works end-to-end: prefs storage, auth, JWT handling, typed API client, multi-tenant data fetch.

## File tree

```
packages/cms-mobile/
├── package.json                 # @webhouse/cms-mobile (private, not published)
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.cjs
├── capacitor.config.ts          # webDir: "dist", NO server.url
├── index.html                   # Vite entry
├── .gitignore                   # ios/App/Pods, android/.gradle, certs, .env.secrets, dist/
├── .env.secrets.example         # documents required keys
├── README.md                    # quickstart for next CC session
├── src/
│   ├── main.tsx                 # ReactDOM render + Capacitor init
│   ├── App.tsx                  # wouter router (onboarding → login → biometric → home)
│   ├── screens/
│   │   ├── Onboarding.tsx       # server URL input + ping validation
│   │   ├── Login.tsx            # QR + email/password tabs
│   │   ├── Biometric.tsx        # FaceID/TouchID unlock
│   │   └── Home.tsx             # native dashboard placeholder
│   ├── api/
│   │   ├── client.ts            # typed fetch wrapper, reads server URL + JWT from prefs
│   │   └── types.ts             # shared types (re-exports from @webhouse/cms where useful)
│   ├── lib/
│   │   ├── prefs.ts             # Capacitor Preferences wrapper (server URL, JWT, settings)
│   │   ├── bridge.ts            # Capacitor plugin facades (biometric, deep link, status bar)
│   │   └── qr.ts                # @capacitor-mlkit/barcode-scanning wrapper
│   ├── components/              # mobile-tuned UI primitives
│   │   ├── Button.tsx           # 44pt minimum touch target
│   │   ├── Input.tsx
│   │   ├── Screen.tsx           # safe-area aware container
│   │   └── Spinner.tsx
│   └── styles/
│       └── globals.css          # Tailwind base + dark theme tokens
├── ios/                         # generated by `cap add ios`
│   └── App/App/
│       ├── Info.plist           # English purpose strings, URL scheme, bundle id
│       ├── en.lproj/
│       │   └── InfoPlist.strings
│       └── da.lproj/
│           └── InfoPlist.strings  # Danish localization
├── android/                     # generated by `cap add android`
│   └── app/src/main/
│       └── AndroidManifest.xml  # URL scheme, permissions
└── scripts/
    ├── icons-generate.sh        # SVG → 1024 PNG → all iOS/Android sizes via sips
    ├── ios-boot.sh              # boot sim + cap run + LAN IP detection
    ├── android-boot.sh          # emulator + cap run
    ├── ios-deeplink-login.sh    # xcrun simctl openurl webhouseapp://login?...
    └── sim-add-qr.sh            # xcrun simctl addmedia booted qr.png
```

In `packages/cms-admin/` (additions only — no modifications to existing files except `CLAUDE.md`):

```
src/
├── app/admin/account/mobile-pairing/
│   └── page.tsx                 # shows QR with one-time pairing token
├── app/api/mobile/
│   ├── ping/route.ts            # GET: server identity + version
│   ├── pair/route.ts            # POST: issue pairing token (5min TTL)
│   ├── pair/exchange/route.ts   # POST: exchange token → JWT
│   ├── me/route.ts              # GET: user + orgs + sites + curation count
│   └── __tests__/
│       └── pair.test.ts         # TTL, single-use, HMAC tests
└── lib/mobile-pairing.ts        # in-memory token store + JWT mint
```

## Plugin versions (cribbed exactly from fysiodk, App Store proven)

```json
{
  "dependencies": {
    "@capacitor/app": "^8.0.0",
    "@capacitor/cli": "^8.0.2",
    "@capacitor/core": "^8.0.2",
    "@capacitor/preferences": "^8.0.0",
    "@capacitor/splash-screen": "^8.0.0",
    "@capacitor/status-bar": "^8.0.0",
    "@capgo/capacitor-native-biometric": "^8.3.6",
    "@capacitor-mlkit/barcode-scanning": "^7.0.0",
    "@tanstack/react-query": "^5.90.20",
    "framer-motion": "^11.15.0",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "react-hook-form": "^7.49.3",
    "wouter": "^3.5.0",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@capacitor/android": "^8.0.2",
    "@capacitor/ios": "^8.0.2",
    "@types/react": "^19.2.13",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.33",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.9.3",
    "vite": "^5.4.11"
  }
}
```

> Tailwind v3 not v4 — Capacitor static builds and Tailwind v4's PostCSS pipeline have some rough edges still. v3 is rock solid. We can upgrade later.

## English purpose strings (Apple-review-safe pattern)

```xml
<key>NSCameraUsageDescription</key>
<string>webhouse.app uses the camera to scan the QR code from your CMS admin login. For example, you can open your CMS in a browser, click "Pair mobile device", and scan the displayed QR code to log in on mobile without typing your password.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>webhouse.app uses your photo library to read a QR code from a saved image when your camera is unavailable. For example, you can save a screenshot of your CMS pairing QR code and select it here to log in.</string>

<key>NSFaceIDUsageDescription</key>
<string>webhouse.app uses Face ID to quickly unlock your CMS session without typing your password every time. For example, you can open the app in the morning and be logged in to your CMS with a single glance.</string>
```

Danish localization in `da.lproj/InfoPlist.strings`:

```
"NSCameraUsageDescription" = "webhouse.app bruger kameraet til at scanne QR-koden fra dit CMS admin login. Du kan for eksempel åbne dit CMS i en browser, klikke 'Par mobil enhed', og scanne den viste QR-kode for at logge ind på mobilen uden at indtaste password.";
"NSPhotoLibraryUsageDescription" = "webhouse.app bruger dit fotobibliotek til at læse en QR-kode fra et gemt billede, hvis dit kamera ikke er tilgængeligt. Du kan for eksempel gemme et screenshot af din CMS pairing QR-kode og vælge det her for at logge ind.";
"NSFaceIDUsageDescription" = "webhouse.app bruger Face ID til hurtigt at låse din CMS-session op uden at indtaste password hver gang. Du kan for eksempel åbne appen om morgenen og være logget ind på dit CMS med et enkelt blik.";
```

## pnpm scripts

**Root `package.json`:**

```json
{
  "scripts": {
    "webhouse.app:ios": "pnpm --filter @webhouse/cms-mobile ios",
    "webhouse.app:android": "pnpm --filter @webhouse/cms-mobile android",
    "wha:ios": "pnpm --filter @webhouse/cms-mobile ios",
    "wha:android": "pnpm --filter @webhouse/cms-mobile android"
  }
}
```

**`packages/cms-mobile/package.json`:**

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "cap:sync": "pnpm build && npx cap sync",
    "ios": "./scripts/ios-boot.sh",
    "android": "./scripts/android-boot.sh",
    "icons:generate": "./scripts/icons-generate.sh",
    "deeplink:login": "./scripts/ios-deeplink-login.sh",
    "sim:add-qr": "./scripts/sim-add-qr.sh"
  }
}
```

## Definition of Done — Phase 1

- [ ] `packages/cms-mobile/` exists, type-checks clean, lints clean
- [ ] `pnpm webhouse.app:ios` boots iOS sim, builds the React app, syncs Capacitor, and opens the app
- [ ] **Onboarding screen** accepts a server URL, validates with `GET <url>/api/mobile/ping`, stores in Preferences
- [ ] `cms-admin` exposes `/admin/account/mobile-pairing` showing a QR (gated behind `NEXT_PUBLIC_CMS_ENABLE_QR_LOGIN`, enabled by default in dev)
- [ ] `cms-admin` exposes `/api/mobile/{ping,pair,pair/exchange,me}` — covered by unit tests
- [ ] **Login screen** QR scan + deep link bypass both successfully exchange the token and store JWT
- [ ] Email/password fallback works against the same `cms-admin` instance
- [ ] **Biometric screen** prompts on 2nd launch and silently re-auths
- [ ] **Home screen** calls `/api/mobile/me` and renders user + sites + curation badge as native React
- [ ] App icon + splash use Concept A (eye on `#0D0D0D`)
- [ ] Purpose strings: English base + Danish localized override
- [ ] `app.webhouse.cms` bundle id everywhere; `webhouseapp://` URL scheme registered
- [ ] Hard rule "Mobile-appen er server-agnostisk" in CMS `CLAUDE.md`
- [ ] Tests: `__tests__/pair.test.ts` covers TTL, single-use, HMAC
- [ ] **Zero Swift, zero Kotlin** code authored in Phase 1
- [ ] **NO** TestFlight upload, **NO** Firebase, **NO** push (Phase 2/8)

## What I will NOT do in Phase 1

- ❌ TestFlight build / Apple Developer Portal setup (Phase 8)
- ❌ Firebase / FCM / push (Phase 2)
- ❌ Google Play Console setup (Phase 8)
- ❌ Touch any cms-admin code outside the new `/admin/account/mobile-pairing`, `/api/mobile/*`, the new `lib/mobile-pairing.ts`, and a single hard-rule line in `CLAUDE.md`
- ❌ Touch port 3010 PM2 process — `pm2 reload cms-admin` only when explicitly approved
- ❌ Write a single line of Swift or Kotlin

## Credentials needed (just-in-time)

**Phase 1: nothing.** Everything runs locally against the dev cms-admin on `https://localhost:3010`. The first secret request happens in Phase 2 (Firebase service account).

## Risks

| Risk | Mitigation |
|---|---|
| Capacitor's WebView rejects `https://localhost:3010` (self-signed cert) | Use `NSAllowsLocalNetworking` + accept exception for `localhost` only in dev. Documented in Info.plist. |
| `app.webhouse.cms` bundle id collision | Check via App Store Connect API when first creating; fall back to `dk.webhouse.cms` |
| pnpm rejects `webhouse.app:ios` script name (dot in name) | Fall back to `wha:ios` immediately, no debate |
| QR pairing token replay attack | Single-use, 5min TTL, HMAC-signed, bound to issuing user id |
| LAN IP changes between dev sessions | `ios-boot.sh` auto-detects via `ipconfig getifaddr en0`, writes to a temp env var the app reads |
| Tailwind v4 breaking with Vite + Capacitor static build | Pinned to v3.4.x, proven combo |
| React 19 + framer-motion peer dep churn | Test framer-motion v11 against React 19 first; downgrade React if needed (unlikely) |

## Execution order

1. ✅ Update plan doc with native-first corrections
2. Add hard rule to CMS `CLAUDE.md`
3. Scaffold `packages/cms-mobile/` skeleton (package.json + configs + src skeleton)
4. `pnpm install` at root → verify workspace picks up new package
5. `cd packages/cms-mobile && npx cap init` (bundle id `app.webhouse.cms`)
6. `npx cap add ios` + `npx cap add android`
7. Implement `cms-admin` mobile API endpoints + tests
8. Implement `/admin/account/mobile-pairing` page
9. Implement Onboarding screen
10. Implement Login screen (QR scanner + email tabs)
11. Implement Biometric screen
12. Implement Home screen
13. Wire Info.plist + AndroidManifest (purpose strings + URL scheme)
14. Generate Concept A icons + splash
15. Write boot/sim scripts
16. Add root pnpm scripts
17. Manual test: `pnpm webhouse.app:ios` end-to-end
18. Manual test: deep link bypass + photo lib QR
19. Manual test: 2nd-launch biometric
20. Type-check + lint
21. Commit in logical chunks
22. Send manual test checklist
