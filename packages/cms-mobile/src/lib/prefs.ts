import { Preferences } from "@capacitor/preferences";

/**
 * Capacitor Preferences wrapper — multi-server edition.
 *
 * Each server is stored as a StoredServer entry in a JSON array.
 * The active server ID points to the one currently in use.
 *
 * Backward-compat: getServerUrl() / getJwt() / setJwt() / setServerUrl()
 * all delegate to the active server so existing callsites need no changes.
 *
 * Migration: old single-server keys (wha.serverUrl, wha.jwt) are
 * automatically imported into the servers list on first access.
 */

// ─── Keys ─────────────────────────────────────────────

const KEY_SERVERS       = "wha.servers";      // JSON: StoredServer[]
const KEY_ACTIVE_SERVER = "wha.activeServer"; // server id string

// Legacy single-server keys (kept for migration only)
const KEY_SERVER_URL    = "wha.serverUrl";
const KEY_JWT           = "wha.jwt";

// Non-server prefs
const KEY_BIOMETRIC_ENABLED = "wha.biometricEnabled";
const KEY_LAST_USER_EMAIL   = "wha.lastUserEmail";
const KEY_ACTIVE_ORG        = "wha.activeOrg";
const KEY_ACTIVE_SITE       = "wha.activeSite";
const KEY_DEFAULT_SITE      = "wha.defaultSite";

// ─── Types ────────────────────────────────────────────

export interface StoredServer {
  id: string;
  url: string;
  name?: string;
  jwt: string | null;
  email?: string;
  addedAt: number;
}

// ─── Helpers ──────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function hostLabel(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

// ─── Server list ──────────────────────────────────────

async function readServers(): Promise<StoredServer[]> {
  const { value } = await Preferences.get({ key: KEY_SERVERS });
  if (value) {
    try { return JSON.parse(value) as StoredServer[]; } catch { /* fall through */ }
  }

  // Migrate legacy single-server keys
  const [{ value: legacyUrl }, { value: legacyJwt }] = await Promise.all([
    Preferences.get({ key: KEY_SERVER_URL }),
    Preferences.get({ key: KEY_JWT }),
  ]);
  if (legacyUrl) {
    const server: StoredServer = {
      id: generateId(),
      url: legacyUrl,
      name: hostLabel(legacyUrl),
      jwt: legacyJwt,
      addedAt: Date.now(),
    };
    await saveServers([server]);
    await Preferences.set({ key: KEY_ACTIVE_SERVER, value: server.id });
    await Preferences.remove({ key: KEY_SERVER_URL });
    await Preferences.remove({ key: KEY_JWT });
    return [server];
  }
  return [];
}

async function saveServers(servers: StoredServer[]): Promise<void> {
  await Preferences.set({ key: KEY_SERVERS, value: JSON.stringify(servers) });
}

export async function getServers(): Promise<StoredServer[]> {
  return readServers();
}

export async function getActiveServer(): Promise<StoredServer | null> {
  const [servers, { value: activeId }] = await Promise.all([
    readServers(),
    Preferences.get({ key: KEY_ACTIVE_SERVER }),
  ]);
  if (servers.length === 0) return null;
  if (activeId) {
    const found = servers.find((s) => s.id === activeId);
    if (found) return found;
  }
  return servers[0] ?? null;
}

export async function setActiveServerId(id: string): Promise<void> {
  await Preferences.set({ key: KEY_ACTIVE_SERVER, value: id });
}

/** Add or update a server entry. Returns the server. */
export async function upsertServer(
  url: string,
  jwt: string | null,
  opts?: { name?: string; email?: string },
): Promise<StoredServer> {
  const servers = await readServers();
  const existing = servers.find((s) => s.url === url);
  if (existing) {
    existing.jwt = jwt ?? existing.jwt;
    if (opts?.name) existing.name = opts.name;
    if (opts?.email) existing.email = opts.email;
    await saveServers(servers);
    await Preferences.set({ key: KEY_ACTIVE_SERVER, value: existing.id });
    return existing;
  }
  const server: StoredServer = {
    id: generateId(),
    url,
    name: opts?.name ?? hostLabel(url),
    jwt,
    email: opts?.email,
    addedAt: Date.now(),
  };
  await saveServers([...servers, server]);
  await Preferences.set({ key: KEY_ACTIVE_SERVER, value: server.id });
  return server;
}

export async function updateServerJwt(id: string, jwt: string): Promise<void> {
  const servers = await readServers();
  const s = servers.find((s) => s.id === id);
  if (s) { s.jwt = jwt; await saveServers(servers); }
}

export async function removeServer(id: string): Promise<void> {
  const servers = await readServers();
  const filtered = servers.filter((s) => s.id !== id);
  await saveServers(filtered);
  const { value: activeId } = await Preferences.get({ key: KEY_ACTIVE_SERVER });
  if (activeId === id) {
    const next = filtered[0];
    if (next) {
      await Preferences.set({ key: KEY_ACTIVE_SERVER, value: next.id });
    } else {
      await Preferences.remove({ key: KEY_ACTIVE_SERVER });
    }
  }
}

// ─── Backward-compat single-server API ────────────────

export async function getServerUrl(): Promise<string | null> {
  const s = await getActiveServer();
  return s?.url ?? null;
}

export async function setServerUrl(url: string): Promise<void> {
  await upsertServer(url, null);
}

export async function clearServerUrl(): Promise<void> {
  const s = await getActiveServer();
  if (s) await removeServer(s.id);
}

export async function getJwt(): Promise<string | null> {
  const s = await getActiveServer();
  return s?.jwt ?? null;
}

export async function setJwt(jwt: string): Promise<void> {
  const servers = await readServers();
  const { value: activeId } = await Preferences.get({ key: KEY_ACTIVE_SERVER });
  const s = servers.find((sv) => sv.id === activeId) ?? servers[0];
  if (s) { s.jwt = jwt; await saveServers(servers); }
}

export async function clearJwt(): Promise<void> {
  const servers = await readServers();
  const { value: activeId } = await Preferences.get({ key: KEY_ACTIVE_SERVER });
  const s = servers.find((sv) => sv.id === activeId) ?? servers[0];
  if (s) { s.jwt = null; await saveServers(servers); }
}

/** Sign out of active server only (removes JWT, keeps server in list). */
export async function signOutActiveServer(): Promise<void> {
  await clearJwt();
}

/** Wipe ALL servers + auth — full reset to onboarding. */
export async function clearAllAuth(): Promise<void> {
  await Promise.all([
    Preferences.remove({ key: KEY_SERVERS }),
    Preferences.remove({ key: KEY_ACTIVE_SERVER }),
    Preferences.remove({ key: KEY_BIOMETRIC_ENABLED }),
    Preferences.remove({ key: KEY_LAST_USER_EMAIL }),
    Preferences.remove({ key: KEY_ACTIVE_ORG }),
    Preferences.remove({ key: KEY_ACTIVE_SITE }),
    // Legacy keys
    Preferences.remove({ key: KEY_SERVER_URL }),
    Preferences.remove({ key: KEY_JWT }),
  ]);
}

// ─── Non-server prefs (unchanged) ─────────────────────

export async function getBiometricEnabled(): Promise<boolean> {
  const { value } = await Preferences.get({ key: KEY_BIOMETRIC_ENABLED });
  return value === "true";
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await Preferences.set({ key: KEY_BIOMETRIC_ENABLED, value: enabled ? "true" : "false" });
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
