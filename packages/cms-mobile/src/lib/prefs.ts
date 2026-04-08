import { Preferences } from "@capacitor/preferences";

/**
 * Capacitor Preferences wrapper.
 *
 * Stores the user's CMS server URL and JWT in Keychain (iOS) /
 * EncryptedSharedPreferences (Android). On web (dev) it falls back
 * to localStorage automatically — no special handling needed.
 *
 * Keys are namespaced under `wha.` to keep things tidy.
 */

const KEY_SERVER_URL = "wha.serverUrl";
const KEY_JWT = "wha.jwt";
const KEY_BIOMETRIC_ENABLED = "wha.biometricEnabled";
const KEY_LAST_USER_EMAIL = "wha.lastUserEmail";

export async function getServerUrl(): Promise<string | null> {
  const { value } = await Preferences.get({ key: KEY_SERVER_URL });
  return value;
}

export async function setServerUrl(url: string): Promise<void> {
  await Preferences.set({ key: KEY_SERVER_URL, value: url });
}

export async function clearServerUrl(): Promise<void> {
  await Preferences.remove({ key: KEY_SERVER_URL });
}

export async function getJwt(): Promise<string | null> {
  const { value } = await Preferences.get({ key: KEY_JWT });
  return value;
}

export async function setJwt(jwt: string): Promise<void> {
  await Preferences.set({ key: KEY_JWT, value: jwt });
}

export async function clearJwt(): Promise<void> {
  await Preferences.remove({ key: KEY_JWT });
}

export async function getBiometricEnabled(): Promise<boolean> {
  const { value } = await Preferences.get({ key: KEY_BIOMETRIC_ENABLED });
  return value === "true";
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await Preferences.set({
    key: KEY_BIOMETRIC_ENABLED,
    value: enabled ? "true" : "false",
  });
}

export async function getLastUserEmail(): Promise<string | null> {
  const { value } = await Preferences.get({ key: KEY_LAST_USER_EMAIL });
  return value;
}

export async function setLastUserEmail(email: string): Promise<void> {
  await Preferences.set({ key: KEY_LAST_USER_EMAIL, value: email });
}

/** Wipe all stored credentials — used by Logout. */
export async function clearAllAuth(): Promise<void> {
  await Promise.all([clearJwt(), Preferences.remove({ key: KEY_BIOMETRIC_ENABLED })]);
}
