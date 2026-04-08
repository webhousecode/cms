# @webhouse/cms-mobile

**webhouse.app** — first-class native mobile app for the CMS.

> Capacitor + React + Vite + Tailwind. One TypeScript codebase → iOS + Android. Talks to any cms-admin server via JSON API. Not a WebView wrapper.

## Quickstart

```bash
# From repo root
pnpm install
pnpm webhouse.app:ios       # boots iOS sim, builds, syncs, opens app
pnpm webhouse.app:android   # same for Android
```

If pnpm rejects the dot in the script name, fall back to:

```bash
pnpm wha:ios
pnpm wha:android
```

## Architecture in one paragraph

`packages/cms-mobile/` is a Vite-built React SPA bundled into the IPA/AAB by Capacitor. It has **no `server.url`** in `capacitor.config.ts` — the user enters their own CMS server URL on first launch (BYO model, like WordPress mobile). All data flows through `src/api/client.ts`, hitting `<server>/api/mobile/*` endpoints with a Bearer JWT in the Authorization header. JWT is stored in Capacitor Preferences (Keychain on iOS, EncryptedSharedPreferences on Android). Native plugins (biometric, QR scanner, push, deep links) come from cross-platform Capacitor plugins — **zero Swift, zero Kotlin** in Phase 1.

## Phase status

- **Phase 1 (current):** MVP shell + auth — onboarding, login (QR + email), biometric, home placeholder
- Phase 2: Push notifications (FCM + Web Push)
- Phase 3: Curation queue (swipe UI)
- Phase 4: Daily dashboard
- Phase 5: Quick draft create (voice + camera + AI)
- Phase 6: AI chat (F107)
- Phase 7: Read-only browsing
- Phase 8: App Store + Play Store submission

See `docs/features/F07-mobile-cocpit-master-plan.md` (master plan) and `docs/features/F07-phase-1-plan.md` (current phase) at the repo root.

## Hard rules

- **Server-agnostic:** never hard-code a CMS server URL, bundle id check, or single-tenant assumption. The app must work against any cms-admin instance.
- **Zero Swift/Kotlin in Phase 1.** If a feature needs native code, stop and ask before writing.
- **Apple purpose strings** use the `[App] uses X to Y. For example...` pattern. Vague strings get rejected.
- **Bearer JWT, never cookies.** All auth flows through the `Authorization` header.
- **Never** kill anything on cms-admin port 3010.
