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
  } catch (err) {
    console.error("Capacitor init error:", err);
  }
}
