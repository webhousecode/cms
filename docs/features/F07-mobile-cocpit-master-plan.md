# F07 — Mobile COCpit · Master Plan

> **For a fresh Claude Code session:** This document is the single source of truth for building the webhouse.app Mobile COCpit (Content Orchestration & Curation) Capacitor app. Read this entire file before doing anything. It supersedes the original `F07-cms-mobile.md` (which assumed Expo/React Native — we now use Capacitor based on proven App Store/Google Play deployment experience from `fysiodk-aalborg-sport`).

## North Star

Build a **reusable mobile-app pipeline** where Claude Code does **EVERYTHING** end-to-end:

- All code, all configs, all secrets handling
- All Apple Developer Portal / App Store Connect / Google Play Console operations (via API where possible, **Playwright** where it isn't)
- All Firebase / FCM / VAPID setup
- All simulator boot, login automation, screenshot capture
- All TestFlight + Internal Testing uploads
- All native build/sign/upload via Fastlane

The user (Christian) is **orchestrator + curator + name-picker**. He provides credentials once, in `.env.secrets` (gitignored). Claude executes the rest. **Manual portal clicking is a bug** — file an issue and write a Playwright script.

This pipeline is a **reusable template**: when we build the next mobile app, the same scripts work after swapping the app id and brand assets.

## Why Capacitor (not Expo/RN)

`fysiodk-aalborg-sport` shipped two apps to App Store and Play Store using:
- Capacitor 8 wrapping Next.js (remote URL mode pointing at the production web)
- Same monorepo as the web codebase
- Fastlane (local) for builds + uploads
- Firebase + Web Push for notifications
- `@capgo/capacitor-native-biometric` for FaceID/TouchID
- AppleScript-based simulator login automation

This recipe is **proven**. We replicate it.

## Mobile COCpit Feature Inventory

Grouped by phase. Phase 1 ships an MVP that's already useful; later phases stack on top.

### Phase 1 — MVP shell + auth (3-4 days)
- Capacitor scaffold inside `packages/cms-admin` (remote URL mode → `https://cms.webhouse.app`)
- iOS + Android projects, app id `app.webhouse.cocpit`, brand assets
- Email/password login screen (reuses CMS `/api/auth/login`)
- Biometric auth via `@capgo/capacitor-native-biometric` — store creds after first login, FaceID/TouchID on subsequent launches
- Session cookie shared with WebView (same pattern as fysiodk Supabase)
- Splash screen, launch icons, dark theme matching CMS admin
- Local dev: `pnpm cocpit:ios` / `pnpm cocpit:android` start the simulator with HMR
- Simulator auto-login via AppleScript (cribbed from `fds-ilogin` / `fds-alogin`)

### Phase 2 — Push notifications (1-2 days)
- FCM project setup via **Firebase Admin REST API + Playwright** for the parts the API doesn't cover
- iOS APNs key (`.p8`) — Playwright into developer.apple.com/account/resources/authkeys
- VAPID keys for web push (sent to admins who don't install the app)
- `device_tokens.json` storage in `_data/` (per user, multi-device)
- Server-side `sendPushNotification(userId, payload)` helper using firebase-admin SDK
- Token registration on app login → POST `/api/push/register`
- Topics: `build_failed`, `build_succeeded`, `agent_completed`, `curation_pending`, `link_check_failed`, `scheduled_publish`
- Topic preferences in Account → Notifications

### Phase 3 — Curation queue (1-2 days)
- Tap notification → deep link to specific curation item
- Tinder-style swipe UI (left = reject, right = approve, tap = open editor)
- Quick edit fields inline before approve
- Bulk approve from a long-press multiselect
- Native action buttons on push notifications (Approve / Reject without opening app)

### Phase 4 — Daily dashboard (1 day)
- Today's drafts, scheduled posts, build status, link-check failures
- Mini chart of activity over last 7 days
- Pull-to-refresh
- Site/org switcher in header

### Phase 5 — Quick draft create (1-2 days)
- "+ New" floating action button
- Voice-to-text dictation (native iOS/Android speech APIs via Capacitor plugin)
- Camera capture → upload to media library → AI alt-text via existing `/api/cms/media/analyze`
- Photo picker for existing camera roll items
- Saves as draft, opens in CMS desktop on next visit

### Phase 6 — AI chat (F107 integration) (1 day)
- Tap chat icon → opens existing F107 chat interface in fullscreen WebView
- Voice input → transcribe → send as chat message
- Push notification when long-running agent completes

### Phase 7 — Read-only browsing (1 day)
- Collections list, document detail, media gallery
- All read-only — editing happens in desktop/quick-draft

### Phase 8 — App store submission (2-3 days)
- Privacy policy page (auto-generated from CMS doc collection)
- App Store screenshots — auto-generated via Playwright running the dev build
- App Store Connect metadata via API (description, keywords, categories)
- TestFlight upload via Fastlane
- Google Play Internal Testing upload via Fastlane
- Submission to review (manual click in App Store Connect — Playwright if needed)

**Total estimate: 12-16 days of focused work** for a feature-complete app submitted to both stores.

## Project Structure (monorepo additions)

```
packages/
  cms-admin/                       # existing — the web app remains the source of truth
  cms-mobile/                      # NEW Capacitor wrapper package
    capacitor.config.ts            # remote URL → cms.webhouse.app
    package.json
    src/
      main.tsx                     # tiny shell, mostly delegates to WebView
      lib/
        capacitor-bridge.ts        # biometric, push, deep-link helpers
        push.ts                    # registration + listeners
    ios/                           # auto-generated by `cap add ios`
      App/App/Info.plist           # purpose strings (DA), bundle id
      App/fastlane/Fastfile        # local build + TestFlight upload
    android/                       # auto-generated by `cap add android`
      app/src/main/AndroidManifest.xml
      fastlane/Fastfile            # local build + Play Internal upload
    scripts/
      cocpit-ios.sh                # boot sim + cap run ios + auto-login
      cocpit-android.sh            # same for Android
      ios-login.sh                 # AppleScript automated email/password
      android-login.sh             # adb input automated email/password
      generate-screenshots.sh      # Playwright → App Store assets
      portal-automation/           # all Playwright scripts for portal work
        apple-create-app.ts
        apple-create-apns-key.ts
        apple-update-screenshots.ts
        google-create-app.ts
        google-upload-aab.ts
        firebase-create-project.ts
```

## Reusable Automation Layer

This is the heart of the project. Every grim manual step gets a script.

### Apple side
| Task | API? | Script |
|------|------|--------|
| Create app id | App Store Connect API | `apple-create-appid.ts` |
| Create provisioning profile | API | `apple-create-profile.ts` |
| Generate APNs key (.p8) | **Playwright** (no API) | `apple-create-apns-key.ts` |
| Upload build | Fastlane → API | `pnpm fastlane:beta` |
| Update metadata | API | `apple-update-metadata.ts` |
| Upload screenshots | API | `apple-upload-screenshots.ts` |
| Submit for review | **Playwright** (API requires phone verification flow) | `apple-submit-review.ts` |
| Reply to review feedback | **Playwright** | `apple-reply-review.ts` |

### Google side
| Task | API? | Script |
|------|------|--------|
| Create app | **Playwright** (Play Console has no app-create API) | `google-create-app.ts` |
| Generate signing key | local `keytool` | `google-create-keystore.sh` |
| Upload AAB | API (service account) | `pnpm fastlane:android:beta` |
| Update store listing | API | `google-update-listing.ts` |
| Upload screenshots | API | `google-upload-screenshots.ts` |
| Submit for review | API | `google-submit-review.ts` |

### Firebase
| Task | API? | Script |
|------|------|--------|
| Create project | Firebase Management API | `firebase-create-project.ts` |
| Add iOS app + download GoogleService-Info.plist | API | `firebase-add-ios.ts` |
| Add Android app + download google-services.json | API | `firebase-add-android.ts` |
| Generate FCM server key | API | `firebase-rotate-server-key.ts` |

### Simulator & device automation
| Task | Tool | Script |
|------|------|--------|
| Boot iOS sim | xcrun simctl | inside `cocpit-ios.sh` |
| Boot Android emulator | emulator + adb | inside `cocpit-android.sh` |
| Type into iOS sim (handles æøå + @) | AppleScript / `xcrun simctl io` | `ios-login.sh` |
| Type into Android emu (handles æøå + @) | `adb shell input text` w/ unicode workaround | `android-login.sh` |
| Capture screenshots for stores | Playwright on the dev build | `generate-screenshots.sh` |
| Reset sim state | `xcrun simctl erase` / `adb emu kill` | `reset-sims.sh` |

### Secrets layout
All credentials live in **one** gitignored file:

```bash
# packages/cms-mobile/.env.secrets — never commit, never log

# Apple
APPLE_ID=cb@webhouse.dk
APPLE_TEAM_ID=...
APPLE_APP_STORE_CONNECT_API_KEY_ID=...
APPLE_APP_STORE_CONNECT_API_ISSUER_ID=...
APPLE_APP_STORE_CONNECT_API_KEY_PATH=./certs/AuthKey_XXXXXX.p8
APPLE_PORTAL_PASSWORD=...   # for Playwright when API isn't enough
APPLE_PORTAL_2FA_PHONE=...  # SMS fallback
APPLE_PORTAL_2FA_BACKUP=... # 1Password / hardware key

# Google
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=./certs/play-service-account.json
GOOGLE_PORTAL_EMAIL=...
GOOGLE_PORTAL_PASSWORD=...

# Firebase
FIREBASE_PROJECT_ID=webhouse-cocpit
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...

# Test user for simulator auto-login
COCPIT_TEST_EMAIL=cb@webhouse.dk
COCPIT_TEST_PASSWORD=...
```

A bootstrap script (`scripts/portal-automation/bootstrap-secrets.sh`) walks the user through gathering each value with explicit instructions and direct deep-links into each portal.

## What Christian Does vs What Claude Does

**Christian:**
- Picks app names, brand colors, app store description copy
- Reviews TestFlight builds on his own iPhone
- Approves PRs / merges to main
- Provides credentials once via `.env.secrets`
- Approves submission to public review
- Talks to Apple App Review if rejection comes back

**Claude (autonomous):**
- Everything else
- Specifically: iterates on UI, runs builds, pushes to TestFlight, generates screenshots, fills out portal forms via Playwright, troubleshoots provisioning issues, writes new automation scripts when manual work shows up

## Hard Rules (carry-over from CLAUDE.md)

- NEVER kill anything on port 3010 — PM2 owns it
- NEVER commit secrets — `.env.secrets` is gitignored, scripts read from it
- NEVER hardcode credentials in source — even test scripts
- iOS purpose strings MUST use the `[App] bruger X til Y. Du kan for eksempel...` pattern (Apple rejects vague strings)
- Use App Store Connect API Key (`.p8`) not legacy Apple ID for Fastlane
- All Playwright scripts must handle Apple's 2FA prompt — fail with clear instructions if SMS code is needed
- Generate fresh secrets with `openssl rand -hex 32` (64 chars)
- All destructive portal operations require explicit user prompt — never auto-delete an app, an AAB, or a TestFlight build

## Phase 0 — Kickoff Checklist (do this first in the new session)

1. Read this file from top to bottom
2. Read `/Users/cb/Apps/webhouse/cms/CLAUDE.md`
3. Read `/Users/cb/Apps/webhouse/fysiodk-aalborg-sport/CLAUDE.md` and `DOCS.md`
4. Skim `/Users/cb/Apps/webhouse/fysiodk-aalborg-sport/apps/web/capacitor.config.ts`, `package.json`, `ios/App/App/Info.plist`, `android/app/src/main/AndroidManifest.xml`
5. Skim `/Users/cb/Apps/webhouse/fysiodk-aalborg-sport/apps/web/src/lib/capacitor-bridge.ts` and `push.ts`
6. Skim `/Users/cb/Apps/webhouse/fysiodk-aalborg-sport/apps/web/scripts/ios-login.sh` and `android-login.sh`
7. Skim `/Users/cb/Apps/webhouse/fysiodk-aalborg-sport/apps/web/ios/App/fastlane/Fastfile`
8. Confirm in chat which phase to start with (default = Phase 1)
9. Ask Christian for `.env.secrets` values needed for that phase, gathering only what's needed (don't ask for App Store credentials before we have a build to upload)
10. Begin

## Reference Files in fysiodk-aalborg-sport

These are the canonical examples to copy:

- `capacitor.config.ts` — remote URL mode, plugins, iOS/Android sections
- `package.json` — exact plugin versions, all scripts (`cap:dev:ios`, `cap:sync`, `fastlane:*`)
- `ios/App/App/Info.plist` — purpose strings, bundle config
- `android/app/src/main/AndroidManifest.xml` — permissions, deep linking
- `src/lib/capacitor-bridge.ts` — biometric helpers
- `src/lib/push.ts` — dual-transport push (FCM + Web Push) with token cleanup
- `scripts/ios-login.sh`, `scripts/android-login.sh` — simulator auto-login
- `scripts/dev-both.sh` — dual simulator launch
- `ios/App/fastlane/Fastfile` — TestFlight upload + version bumping
- `android/fastlane/Fastfile` — Play Internal upload + version bumping
- `docs/FASTLANE.md`, `docs/FASTLANE-ANDROID.md` — portal walkthroughs

When in doubt about how to do something Capacitor-y, look at fysiodk first.

## Out of Scope (for now)

- React Native variant (we picked Capacitor, full stop)
- Building the desktop CMS as an Electron wrapper (separate F-number if ever)
- Multi-tenant white-label of the COCpit app (single brand for v1)
- Voice-only mode / accessibility-first UI (later)
- Offline-first sync engine — Phase 1-7 assume online; Phase 9 could add offline cache

## Open Questions (Christian to answer in new session)

- App name in App Store: "webhouse.app COCpit" or just "COCpit" or "Webhouse COCpit"?
- Brand color override on the mobile splash, or reuse the gold/dark from the web?
- Apple Developer account: existing personal team or new business team?
- Google Play Console: existing developer account or new?
- Firebase project: reuse an existing one or create dedicated `webhouse-cocpit`?
