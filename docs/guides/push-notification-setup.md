# Push Notification Setup — Complete Manuskript

> Verified working on real iPhone 14 Pro, 2026-04-09.
> Covers: Capacitor 8 + Firebase Cloud Messaging + APNs + cms-admin server.

## Prerequisites

- Apple Developer account (Team ID: find at developer.apple.com top-right)
- Firebase project created (console.firebase.google.com)
- iOS app registered in Firebase (bundle ID must match Xcode project)
- Capacitor 8 project with `@capacitor/push-notifications` installed
- `firebase-admin` installed in the server project (`pnpm add firebase-admin`)

---

## Step 1: Create APNs Key in Apple Developer Portal

1. Go to https://developer.apple.com/account/resources/authkeys/list
2. Click **Keys +**
3. Key Name: `your app APNs` (NO dots, @, &, *, etc. — Apple rejects special characters)
4. Check **Apple Push Notifications service (APNs)**
5. Click **Configure** → select **Sandbox & Production** → select your app
6. Click **Continue** → **Register**
7. **Download the .p8 file** (can only be downloaded ONCE — save it safely)
8. Note the **Key ID** (shown on the confirmation page, e.g. `VJX23AN5WB`)

**Save these values — you need them in Step 2:**
- Key ID: `________`
- Team ID: `________` (shown top-right on developer.apple.com)
- .p8 file path: `________`

---

## Step 2: Upload APNs Key to Firebase Console

1. Go to Firebase Console → Project Settings → Cloud Messaging tab
2. Scroll to **Apple app configuration**
3. Select your iOS app
4. Upload the .p8 file as **Development APNs auth key**:
   - File: the .p8 from Step 1
   - Key ID: from Step 1
   - Team ID: from Step 1
5. Upload the **same .p8 file** as **Production APNs auth key** with same Key ID and Team ID

**CRITICAL: Upload BOTH Development AND Production.** Dev builds use `aps-environment=development`. If you only upload Production, push silently fails with `InvalidProviderToken` (ApnsError 403).

---

## Step 3: Firebase Admin SDK Service Account

Use Firebase's **default** Admin SDK service account — NOT a custom one.

1. Go to Firebase Console → Project Settings → Service accounts tab
2. Click **Generate new private key** → download JSON file
3. From the JSON file, extract these values for your `.env.local`:

```bash
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"
```

**The `\n` in the private key must be literal backslash-n in .env files.** The server code converts them to real newlines with `.replace(/\\n/g, "\n")`.

**DO NOT use a custom service account.** The default `firebase-adminsdk-*` account has the correct `roles/firebase.sdkAdminServiceAgent` role. Custom accounts with `roles/firebase.admin` lack the FCM send permission.

---

## Step 4: iOS Xcode Project Setup

### 4a. Add Firebase SDK via SPM

In Xcode (or project.pbxproj manually):

1. File → Add Package Dependencies
2. URL: `https://github.com/firebase/firebase-ios-sdk`
3. Version: Up to Next Major from `11.0.0`
4. Add **FirebaseMessaging** product to your app target

**Do NOT add Firebase to `CapApp-SPM/Package.swift`** — that file is auto-managed by Capacitor CLI. Add it as a remote package on the Xcode project itself.

### 4b. GoogleService-Info.plist

1. Download from Firebase Console → Project Settings → General → Your iOS app
2. Place in `ios/App/App/GoogleService-Info.plist`
3. **Add to Xcode project as a Resource** — the file must be in the PBXResourcesBuildPhase. Just having it in the directory is NOT enough. Firebase crashes at runtime if it can't find it in the bundle.

Verify in project.pbxproj:
- PBXFileReference entry exists
- PBXBuildFile entry exists (in Resources section)
- Listed in the App group's children
- Listed in PBXResourcesBuildPhase files

### 4c. AppDelegate.swift

```swift
import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        FirebaseApp.configure()
        return true
    }

    // APNs token → FCM token exchange.
    // Firebase needs the raw APNs token to map it to an FCM registration token.
    // The FCM token is then posted to Capacitor's JS bridge via NotificationCenter.
    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
        Messaging.messaging().token { token, error in
            if let error = error {
                NotificationCenter.default.post(
                    name: .capacitorDidFailToRegisterForRemoteNotifications,
                    object: error
                )
            } else if let token = token {
                NotificationCenter.default.post(
                    name: .capacitorDidRegisterForRemoteNotifications,
                    object: token
                )
            }
        }
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(
            name: .capacitorDidFailToRegisterForRemoteNotifications,
            object: error
        )
    }

    // ... keep existing URL handling methods for deep links
}
```

### 4d. App.entitlements

```xml
<key>aps-environment</key>
<string>development</string>
```

Change to `production` for App Store builds.

### 4e. Info.plist

```xml
<key>UIBackgroundModes</key>
<array>
    <string>remote-notification</string>
</array>
```

---

## Step 5: JavaScript/TypeScript Client Code

Two-phase approach (token arrives before user logs in):

### Phase 1: Boot — request permission + listen for token

```typescript
async function setupPushListeners() {
  if (!Capacitor.isNativePlatform()) return;

  const { PushNotifications } = await import("@capacitor/push-notifications");

  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") return;

  // FCM token arrives here (from AppDelegate → NotificationCenter → Capacitor)
  PushNotifications.addListener("registration", (token) => {
    // Save to localStorage — will be sent to server after login
    localStorage.setItem("pendingPushToken", JSON.stringify({
      token: token.value,
      platform: Capacitor.getPlatform(), // "ios" or "android"
    }));
  });

  PushNotifications.addListener("registrationError", (err) => {
    console.warn("Push registration error:", err);
  });

  // Trigger native APNs registration
  await PushNotifications.register();
}
```

### Phase 2: After login — send token to server

```typescript
async function registerPendingPushToken(serverUrl: string, jwt: string) {
  // Wait up to 15s for token
  let attempts = 0;
  while (!localStorage.getItem("pendingPushToken") && attempts < 15) {
    await new Promise(r => setTimeout(r, 1000));
    attempts++;
  }

  const raw = localStorage.getItem("pendingPushToken");
  if (!raw) return;

  const { token, platform } = JSON.parse(raw);
  const res = await fetch(`${serverUrl}/api/mobile/push/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ token, platform }),
  });

  if (res.ok) localStorage.removeItem("pendingPushToken");
}
```

**Note:** `setupPushListeners()` runs at app boot. `registerPendingPushToken()` runs from the home screen after login. The token can arrive before OR after login — the pending-token pattern handles both cases.

---

## Step 6: Server — Send Push Notifications

```typescript
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

function getFirebaseMessaging() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing FIREBASE_* env vars");
  }

  const app = getApps().length > 0
    ? getApps()[0]
    : initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });

  return getMessaging(app);
}

// Send to a specific device
async function sendPush(fcmToken: string, title: string, body: string) {
  const result = await getFirebaseMessaging().send({
    token: fcmToken,
    notification: { title, body },
    apns: {
      payload: {
        aps: {
          sound: "default",
          badge: 1,
        },
      },
    },
  });
  return result; // e.g. "projects/my-project/messages/123456"
}
```

---

## Step 7: Verify End-to-End

```bash
# Quick test from CLI
node -e "
const { initializeApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');

const app = initializeApp({ credential: cert(require('/path/to/service-account-key.json')) });

getMessaging(app).send({
  token: 'YOUR_FCM_TOKEN_FROM_DEVICE',
  notification: { title: 'Test', body: 'Push works!' },
  apns: { payload: { aps: { sound: 'default' } } },
}).then(r => console.log('SUCCESS:', r)).catch(e => console.log('ERROR:', e.code, e.message));
"
```

Expected: `SUCCESS: projects/your-project/messages/...`

If `InvalidProviderToken`: APNs key not uploaded or wrong environment (dev vs prod).
If `third-party-auth-error`: Same issue — check Firebase Console APNs configuration.
If `registration-token-not-registered`: Token expired or from wrong project.

---

## Common Mistakes (all verified the hard way)

| Mistake | Symptom | Fix |
|---------|---------|-----|
| GoogleService-Info.plist in directory but NOT in Xcode build resources | App crashes on launch | Add to PBXResourcesBuildPhase in project.pbxproj |
| Only Production APNs key uploaded to Firebase | `InvalidProviderToken` (403) on dev builds | Upload BOTH Development AND Production keys |
| Using custom service account instead of default firebase-adminsdk | `third-party-auth-error` | Use the default service account from Firebase Console → Service accounts |
| APNs key created without APNs service enabled | `InvalidProviderToken` | Must check "Apple Push Notifications service (APNs)" when creating key |
| Apple key name contains dots or special chars | "Invalid name" error in Apple portal | Use only letters, numbers, spaces |
| `aps-environment=development` in entitlements but Production key only | Push silently fails | Match entitlements to uploaded key environments |
| `FirebaseApp.configure()` not called in AppDelegate | FCM token never generated | Must be first line in didFinishLaunchingWithOptions |
| Token saved but server URL is localhost (phone can't reach) | Token register POST fails silently | Use LAN IP or deployed server URL |
| Notification sent while app in foreground | No banner shown | iOS default — handle in `pushNotificationReceived` listener |
