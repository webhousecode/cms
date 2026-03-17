# F59 — Passwordless Auth (Passkeys + QR Code Login)

> Discord-style login with passkeys (WebAuthn biometrics) and QR code scan via the webhouse.app mobile app.

## Problem

CMS login is email/password only (plus GitHub OAuth via F26). This is:

1. **Insecure** — passwords get reused, phished, and forgotten
2. **Slow** — typing credentials every time, especially on mobile
3. **No 2FA** — the Security tab in Account Preferences has a placeholder for 2FA but nothing works
4. **No mobile integration** — no way to use the mobile app to authenticate the desktop session

Discord solved this elegantly: QR code on login page, scan with mobile app, instantly logged in. See [reference screenshot](assets/discord-login-reference.png). Passkeys (WebAuthn) add biometric login (FaceID/TouchID/Windows Hello) directly in the browser.

## Solution

Two passwordless auth mechanisms that complement email/password:

1. **Passkeys (WebAuthn)** — register a passkey from Account → Security. Login page shows "Sign in with passkey" button. Uses browser-native biometric prompts (FaceID, TouchID, Windows Hello, fingerprint).

2. **QR Code Login** — login page shows a QR code (like Discord). User scans it with the **webhouse.app Pocket CMS** mobile app (Capacitor-based). App authenticates via FaceID/TouchID, confirms the session, and the desktop browser is instantly logged in via WebSocket/SSE.

The mobile app is built with **Capacitor** (not Expo/RN — proven deployable to App Store/Google Play with JS/TS). It doubles as the F07 COCpit mobile app.

## Technical Design

### 1. Passkey (WebAuthn) Registration & Login

```typescript
// packages/cms-admin/src/lib/webauthn.ts
import { generateRegistrationOptions, verifyRegistrationResponse,
         generateAuthenticationOptions, verifyAuthenticationResponse } from "@simplewebauthn/server";

export interface StoredPasskey {
  id: string;                    // base64url credential ID
  publicKey: Uint8Array;         // public key bytes
  counter: number;               // signature counter
  deviceType: string;            // "singleDevice" | "multiDevice"
  name: string;                  // user-given name, e.g. "MacBook TouchID"
  createdAt: string;
  lastUsedAt?: string;
}

// Stored per-user in users.json
export interface User {
  // ...existing fields
  passkeys?: StoredPasskey[];
}
```

**API Routes:**

```
POST /api/auth/passkey/register/options   → generate registration challenge
POST /api/auth/passkey/register/verify    → verify & store passkey
POST /api/auth/passkey/login/options      → generate authentication challenge
POST /api/auth/passkey/login/verify       → verify & create session
DELETE /api/auth/passkey/[id]             → remove a passkey
GET  /api/auth/passkey                    → list user's passkeys
```

**npm package:** `@simplewebauthn/server` + `@simplewebauthn/browser` (well-maintained, TypeScript-native, handles all the CBOR/COSE complexity).

### 2. QR Code Login Flow

Discord-style flow using WebSocket for real-time session transfer:

```
┌─────────────────┐                    ┌──────────────────┐
│  Desktop Browser │                    │   Mobile App     │
│                  │                    │  (Pocket CMS)    │
├──────────────────┤                    ├──────────────────┤
│ 1. GET /api/auth/qr/session          │                  │
│    → { sessionId, qrData, wsUrl }    │                  │
│                                       │                  │
│ 2. Show QR code (encodes sessionId   │                  │
│    + CMS admin URL)                   │                  │
│                                       │                  │
│ 3. Connect WebSocket, wait...         │                  │
│                                       │ 4. Scan QR code  │
│                                       │ 5. FaceID/TouchID│
│                                       │ 6. POST /api/auth│
│                                       │    /qr/approve   │
│                                       │    { sessionId,  │
│                                       │      userToken } │
│ 7. WebSocket receives "approved"      │                  │
│ 8. Set session cookie, redirect       │                  │
│    to /admin                          │                  │
└───────────────────────────────────────┴──────────────────┘
```

**API Routes:**

```
POST /api/auth/qr/session              → create pending QR session (returns sessionId + secret)
GET  /api/auth/qr/status/[sessionId]   → SSE stream for session status (pending → approved → expired)
POST /api/auth/qr/approve              → mobile app approves session (sends user JWT + sessionId)
```

**QR Code content:**

```json
{
  "type": "cms-login",
  "url": "https://cms-admin.example.com",
  "sid": "abc123-session-id",
  "exp": 1679000000
}
```

**Session lifecycle:** created → pending (5 min TTL) → approved/expired. Stored in memory (Map) or Redis for multi-instance.

### 3. Account → Security Tab

```
Account Preferences → Security

PASSKEYS
┌─────────────────────────────────────────────────┐
│ 🔑 MacBook Pro TouchID       Added 15 Mar 2026 │
│    Last used: 2 hours ago              [Remove] │
│                                                  │
│ 🔑 iPhone FaceID             Added 10 Mar 2026 │
│    Last used: yesterday                [Remove] │
│                                                  │
│ [+ Add passkey]                                  │
└─────────────────────────────────────────────────┘

QR CODE LOGIN
┌─────────────────────────────────────────────────┐
│ ✅ Enabled                                       │
│ Scan a QR code on the login page with the       │
│ webhouse.app mobile app to sign in instantly.    │
│                                                  │
│ 📱 Download: App Store | Google Play            │
└─────────────────────────────────────────────────┘

CHANGE PASSWORD
┌─────────────────────────────────────────────────┐
│ Current password: [________________]            │
│ New password:     [________________]            │
│ [Save]                                          │
└─────────────────────────────────────────────────┘
```

### 4. Login Page Update

Discord-style layout — email/password on left, QR code on right:

```
┌──────────────────────────────────────────────────────┐
│                    webhouse.app                       │
│                                                      │
│  ┌─────────────────────┐  ┌──────────────────────┐  │
│  │                      │  │    ┌──────────┐      │  │
│  │ Email:               │  │    │ QR CODE  │      │  │
│  │ [________________]   │  │    │          │      │  │
│  │                      │  │    └──────────┘      │  │
│  │ Password:            │  │                      │  │
│  │ [________________]   │  │  Log in with QR Code │  │
│  │                      │  │  Scan with the       │  │
│  │ [    Sign in    ]    │  │  webhouse.app mobile  │  │
│  │                      │  │  app to log in.       │  │
│  │ Or, sign in with     │  │                      │  │
│  │ passkey              │  │                      │  │
│  └─────────────────────┘  └──────────────────────┘  │
│                                                      │
│  [GitHub] [Google] [Discord]  ← F50 providers        │
└──────────────────────────────────────────────────────┘
```

### 5. Mobile App — Pocket CMS (Capacitor)

> Note: This updates the vision from F07 (which assumed Expo/React Native) to **Capacitor** based on proven experience deploying JS apps to App Store/Google Play.

```
packages/cms-mobile/               # or separate repo
  src/
    App.tsx                        # Capacitor + React/Preact app
    pages/
      Login.tsx                    # CMS URL + credentials
      Dashboard.tsx                # Daily summary
      Curation.tsx                 # Swipe approve/reject
      Scanner.tsx                  # QR code scanner for desktop login
    lib/
      api.ts                       # CMS API client
      biometric.ts                 # FaceID/TouchID via @capgo/capacitor-native-biometric
      push.ts                      # Push via @capacitor/push-notifications
      qr-scanner.ts               # Camera QR scan via @nickreid/capacitor-qr-scanner
    capacitor.config.ts
    ios/                           # Xcode project (auto-generated)
    android/                       # Android Studio project (auto-generated)
```

**Key Capacitor plugins:**
- `@capacitor/camera` — QR code scanning
- `@capgo/capacitor-native-biometric` — FaceID/TouchID
- `@capacitor/push-notifications` — native push
- `@nickreid/capacitor-qr-scanner` — dedicated QR scanner

**Purpose strings (Apple review — per CLAUDE.md rules):**

```xml
<key>NSCameraUsageDescription</key>
<string>Pocket CMS bruger kameraet til at scanne QR-koder på login-siden. Du kan for eksempel scanne en QR-kode vist på din computer for at logge ind øjeblikkeligt uden at skrive adgangskode.</string>

<key>NSFaceIDUsageDescription</key>
<string>Pocket CMS bruger Face ID til at bekræfte din identitet, når du logger ind eller godkender login på en anden enhed. Du kan for eksempel bekræfte et QR-kode login med Face ID i stedet for adgangskode.</string>
```

## Implementation Steps

1. Install `@simplewebauthn/server` + `@simplewebauthn/browser` in `packages/cms-admin`
2. Create `packages/cms-admin/src/lib/webauthn.ts` — registration/verification helpers
3. Extend `User` type with `passkeys?: StoredPasskey[]`
4. Create passkey API routes (`/api/auth/passkey/*`)
5. Build passkey management UI in Account → Security tab (list, add, remove)
6. Add "Sign in with passkey" to login page
7. Create QR session API routes (`/api/auth/qr/*`)
8. Add QR code to login page (right side, Discord-style) using `qrcode` npm package
9. Add SSE endpoint for QR session status polling
10. Scaffold Capacitor mobile app with React + TypeScript
11. Build QR scanner page in mobile app
12. Add FaceID/TouchID biometric confirmation in mobile app
13. Add native push notifications for curation queue events
14. Configure Capacitor for iOS + Android builds
15. Submit to App Store / Google Play
16. Update F07 plan to reflect Capacitor instead of Expo/React Native

## Dependencies

- F01 (Invite Users) — Done. User management infrastructure
- F26 (GitHub Login) — Done. OAuth pattern to extend
- F50 (Sign In Providers) — complements but not required. F59 handles passwordless, F50 handles OAuth providers

## Effort Estimate

**Large** — 8-10 days

- Days 1-2: Passkey (WebAuthn) — server + client + Security UI
- Days 3-4: QR code login — session flow, SSE, login page redesign
- Days 5-7: Capacitor mobile app — scaffold, QR scanner, biometric, push
- Days 8-9: App Store / Google Play submission + review
- Day 10: Integration testing, edge cases
