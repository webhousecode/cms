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
const KEY_ACTIVE_ORG = "wha.activeOrg";
const KEY_ACTIVE_SITE = "wha.activeSite";
const KEY_DEFAULT_SITE = "wha.defaultSite"; // "orgId/siteId" or null

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

export async function getActiveOrgId(): Promise<string | null> {
  const { value } = await Preferences.get({ key: KEY_ACTIVE_ORG });
  return value;
}

export async function setActiveOrgId(orgId: string): Promise<void> {
  await Preferences.set({ key: KEY_ACTIVE_ORG, value: orgId });
}

export async function getActiveSiteId(): Promise<string | null> {
  const { value } = await Preferences.get({ key: KEY_ACTIVE_SITE });
  return value;
}

export async function setActiveSiteId(siteId: string): Promise<void> {
  await Preferences.set({ key: KEY_ACTIVE_SITE, value: siteId });
}

/** Default site — app boots directly to this site's page. Format: "orgId/siteId" */
export async function getDefaultSite(): Promise<{ orgId: string; siteId: string } | null> {
  const { value } = await Preferences.get({ key: KEY_DEFAULT_SITE });
  if (!value) return null;
  const [orgId, siteId] = value.split("/");
  return orgId && siteId ? { orgId, siteId } : null;
}

export async function setDefaultSite(orgId: string, siteId: string): Promise<void> {
  await Preferences.set({ key: KEY_DEFAULT_SITE, value: `${orgId}/${siteId}` });
}

export async function clearDefaultSite(): Promise<void> {
  await Preferences.remove({ key: KEY_DEFAULT_SITE });
}

/** Wipe all stored credentials + server URL — used by Sign out.
 *  Clears everything so the app returns to Onboarding on next launch. */
export async function clearAllAuth(): Promise<void> {
  await Promise.all([
    clearJwt(),
    clearServerUrl(),
    Preferences.remove({ key: KEY_BIOMETRIC_ENABLED }),
    Preferences.remove({ key: KEY_LAST_USER_EMAIL }),
    Preferences.remove({ key: KEY_ACTIVE_ORG }),
    Preferences.remove({ key: KEY_ACTIVE_SITE }),
  ]);
}
