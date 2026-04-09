import { Capacitor } from "@capacitor/core";

/**
 * Capacitor native bridge facade.
 *
 * All functions are no-ops in the browser — safe to import everywhere.
 * Phase 1 wires biometric, splash, status bar, and deep links.
 * Phase 2 will add push notifications.
 */

export const isNative = () => Capacitor.isNativePlatform();
export const platform = () => Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
export const isIOS = () => platform() === "ios";
export const isAndroid = () => platform() === "android";

// ─── Splash ────────────────────────────────────────────
export async function hideSplash(): Promise<void> {
  if (!isNative()) return;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch (err) {
    console.error("hideSplash failed:", err);
  }
}

// ─── Status bar ────────────────────────────────────────
export async function setDarkStatusBar(): Promise<void> {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
  } catch (err) {
    console.error("setDarkStatusBar failed:", err);
  }
}

// ─── App lifecycle + deep links ────────────────────────
type DeepLinkHandler = (url: string) => void;
const deepLinkHandlers: DeepLinkHandler[] = [];

export function onDeepLink(handler: DeepLinkHandler): () => void {
  deepLinkHandlers.push(handler);
  return () => {
    const idx = deepLinkHandlers.indexOf(handler);
    if (idx >= 0) deepLinkHandlers.splice(idx, 1);
  };
}

async function initDeepLinks(): Promise<void> {
  if (!isNative()) return;
  try {
    const { App } = await import("@capacitor/app");
    App.addListener("appUrlOpen", (event) => {
      console.log("Deep link:", event.url);
      for (const handler of deepLinkHandlers) {
        try {
          handler(event.url);
        } catch (err) {
          console.error("Deep link handler error:", err);
        }
      }
    });
  } catch (err) {
    console.error("initDeepLinks failed:", err);
  }
}

// ─── Biometric ─────────────────────────────────────────
const BIOMETRIC_SERVER = "webhouse.app";

export interface BiometricAvailability {
  isAvailable: boolean;
  biometryType: "face" | "fingerprint" | "none";
}

export async function checkBiometric(): Promise<BiometricAvailability> {
  if (!isNative()) return { isAvailable: false, biometryType: "none" };
  try {
    const { NativeBiometric, BiometryType } = await import(
      "@capgo/capacitor-native-biometric"
    );
    const result = await NativeBiometric.isAvailable();
    let type: BiometricAvailability["biometryType"] = "none";
    if (
      result.biometryType === BiometryType.FACE_ID ||
      result.biometryType === BiometryType.FACE_AUTHENTICATION
    ) {
      type = "face";
    } else if (
      result.biometryType === BiometryType.TOUCH_ID ||
      result.biometryType === BiometryType.FINGERPRINT
    ) {
      type = "fingerprint";
    }
    return { isAvailable: result.isAvailable, biometryType: type };
  } catch (err) {
    console.error("checkBiometric failed:", err);
    return { isAvailable: false, biometryType: "none" };
  }
}

export async function storeBiometricJwt(jwt: string): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
    await NativeBiometric.setCredentials({
      server: BIOMETRIC_SERVER,
      username: "jwt", // we use the credential slot to store JWT, not user/pass
      password: jwt,
    });
    return true;
  } catch (err) {
    console.error("storeBiometricJwt failed:", err);
    return false;
  }
}

export async function unlockBiometricJwt(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
    await NativeBiometric.verifyIdentity({
      reason: "Unlock your CMS session",
      title: "webhouse.app",
      subtitle: "Confirm your identity",
    });
    const creds = await NativeBiometric.getCredentials({ server: BIOMETRIC_SERVER });
    return creds.password ?? null;
  } catch (err) {
    console.error("unlockBiometricJwt failed:", err);
    return null;
  }
}

export async function clearBiometricJwt(): Promise<void> {
  if (!isNative()) return;
  try {
    const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
    await NativeBiometric.deleteCredentials({ server: BIOMETRIC_SERVER });
  } catch (err) {
    console.warn("clearBiometricJwt failed (may not exist):", err);
  }
}

// ─── Push notifications (Phase 2) ─────────────────────
//
// Two-phase setup:
//   1. setupPushListeners() — runs at boot (initCapacitor). Requests
//      permission, registers Capacitor listeners, calls native register.
//      The OS/FCM gives us a token via the "registration" event; we
//      stash it in localStorage as a pending token.
//   2. registerPendingPushToken() — runs from /home AFTER login. Sends
//      the pending token to the server with a Bearer JWT. If no token
//      yet, polls up to 15s.
//
// This split is necessary because the FCM token can arrive BEFORE the
// user logs in, but we can't POST it to the server until we have a JWT.

const PUSH_TOKEN_KEY = "wha.pendingPushToken";

interface PendingToken {
  token: string;
  platform: "ios" | "android";
}

function savePendingToken(token: string, plat: "ios" | "android") {
  try {
    localStorage.setItem(PUSH_TOKEN_KEY, JSON.stringify({ token, platform: plat }));
  } catch {
    // localStorage unavailable
  }
}

function loadPendingToken(): PendingToken | null {
  try {
    const raw = localStorage.getItem(PUSH_TOKEN_KEY);
    return raw ? (JSON.parse(raw) as PendingToken) : null;
  } catch {
    return null;
  }
}

function clearPendingToken() {
  try {
    localStorage.removeItem(PUSH_TOKEN_KEY);
  } catch {
    // localStorage unavailable
  }
}

export async function setupPushListeners(): Promise<void> {
  if (!isNative()) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    // Permission prompt — iOS shows the system dialog the first time.
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") {
      console.warn("[push] permission not granted:", perm.receive);
      return;
    }

    // Token from FCM/APNs
    PushNotifications.addListener("registration", (token) => {
      const plat = isIOS() ? "ios" : "android";
      console.log("[push] got registration token:", token.value.slice(0, 16) + "...");
      savePendingToken(token.value, plat);
      // Try to register immediately — works if user is already logged in
      void registerPendingPushToken().catch((err) => {
        console.warn("[push] eager register failed:", err);
      });
    });

    PushNotifications.addListener("registrationError", (err) => {
      console.warn("[push] registration error:", err);
    });

    // Foreground notification
    PushNotifications.addListener("pushNotificationReceived", (notif) => {
      console.log("[push] received in foreground:", notif);
      document.dispatchEvent(
        new CustomEvent("wha:push-received", { detail: notif }),
      );
    });

    // User tapped a notification
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      console.log("[push] tapped:", action);
      const data = action.notification.data as { url?: string } | undefined;
      if (data?.url) {
        // Defer to next tick so React routers are mounted
        setTimeout(() => {
          window.location.hash = "";
          window.history.pushState({}, "", data.url);
          // Dispatch a popstate so wouter picks it up
          window.dispatchEvent(new PopStateEvent("popstate"));
        }, 50);
      }
    });

    // Trigger native registration
    await PushNotifications.register();
  } catch (err) {
    console.error("[push] setupPushListeners failed:", err);
  }
}

/**
 * Send any pending push token to the server. Called from /home after login.
 * Polls up to 15s for the token to arrive from native.
 */
export async function registerPendingPushToken(): Promise<boolean> {
  if (!isNative()) return false;

  // Wait up to 15s for the registration event to land
  let attempts = 0;
  while (!loadPendingToken() && attempts < 15) {
    await new Promise((r) => setTimeout(r, 1000));
    attempts++;
  }

  const pending = loadPendingToken();
  if (!pending) {
    console.warn("[push] no pending token after 15s");
    return false;
  }

  // Lazy import to avoid circular deps with api/client
  const { getServerUrl, getJwt } = await import("./prefs");
  const server = await getServerUrl();
  const jwt = await getJwt();
  if (!server || !jwt) return false;

  try {
    const res = await fetch(`${server}/api/mobile/push/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      credentials: "omit",
      body: JSON.stringify({ token: pending.token, platform: pending.platform }),
    });
    if (!res.ok) {
      console.warn("[push] register failed:", res.status, await res.text().catch(() => ""));
      return false;
    }
    clearPendingToken();
    console.log("[push] token registered with server");
    return true;
  } catch (err) {
    console.error("[push] register network error:", err);
    return false;
  }
}

// ─── Push debug ───────────────────────────────────────
/** Returns push registration status for debugging. */
export async function getPushDebugInfo(): Promise<Record<string, string>> {
  const info: Record<string, string> = {};
  info.native = isNative() ? "yes" : "no";
  info.platform = platform();

  const pending = loadPendingToken();
  info.pendingToken = pending ? pending.token.slice(0, 20) + "..." : "none";
  info.pendingPlatform = pending?.platform ?? "none";

  if (!isNative()) return info;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.checkPermissions();
    info.permission = perm.receive;
  } catch (err) {
    info.permission = `error: ${(err as Error).message}`;
  }

  return info;
}

/** Force re-register for push and return result. */
export async function forceRegisterPush(): Promise<string> {
  if (!isNative()) return "not native";

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    // Set up one-shot listeners
    const result = await new Promise<string>((resolve) => {
      const timeout = setTimeout(() => resolve("timeout (15s) — no token received"), 15000);

      PushNotifications.addListener("registration", (token) => {
        clearTimeout(timeout);
        const plat = isIOS() ? "ios" : "android";
        savePendingToken(token.value, plat);
        resolve(`✓ token: ${token.value.slice(0, 30)}...`);
      });

      PushNotifications.addListener("registrationError", (err) => {
        clearTimeout(timeout);
        resolve(`✗ error: ${JSON.stringify(err)}`);
      });

      PushNotifications.register().catch((err) => {
        clearTimeout(timeout);
        resolve(`✗ register() threw: ${(err as Error).message}`);
      });
    });

    return result;
  } catch (err) {
    return `✗ exception: ${(err as Error).message}`;
  }
}

// ─── Master init ───────────────────────────────────────
export async function initCapacitor(): Promise<void> {
  if (!isNative()) {
    console.log("Running in browser — Capacitor plugins disabled");
    return;
  }
  console.log(`Capacitor initialized on ${platform()}`);
  try {
    await setDarkStatusBar();
    await hideSplash();
    await initDeepLinks();
    // Phase 2: kick off push registration. Permission prompt fires here
    // on first launch. The server-side wire-up happens later from Home.
    await setupPushListeners();
  } catch (err) {
    console.error("Capacitor init error:", err);
  }
}
