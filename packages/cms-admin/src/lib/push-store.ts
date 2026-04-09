/**
 * F07 Phase 2 — push token storage.
 *
 * Persists per-user device tokens (FCM for native, web push subscriptions
 * for desktop browsers) plus topic preferences. Stored in `_data/device_tokens.json`
 * next to `users.json` so it's CMS-wide, not per-site.
 *
 * Schema (one document):
 *   {
 *     tokens: [
 *       { id, userId, platform: "ios"|"android"|"web", token, registeredAt, lastSeen, deviceLabel? },
 *       ...
 *     ],
 *     prefs: {
 *       [userId]: { build_failed: true, build_succeeded: false, ... }
 *     }
 *   }
 *
 * Plain JSON for now — will move to per-site SQLite if/when we get
 * thousands of tokens. For Phase 2 the JSON is fine.
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { getActiveSitePaths } from "./site-paths";

export type PushPlatform = "ios" | "android" | "web";

export interface DeviceToken {
  id: string;
  userId: string;
  platform: PushPlatform;
  /** Native FCM/APNs token, OR JSON-stringified web push subscription */
  token: string;
  registeredAt: string;
  lastSeen: string;
  /** Free-form label set by the device (e.g. "iPhone 15 Pro") */
  deviceLabel?: string;
}

export type TopicKey =
  | "build_failed"
  | "build_succeeded"
  | "agent_completed"
  | "curation_pending"
  | "link_check_failed"
  | "scheduled_publish";

export const ALL_TOPICS: TopicKey[] = [
  "build_failed",
  "build_succeeded",
  "agent_completed",
  "curation_pending",
  "link_check_failed",
  "scheduled_publish",
];

/** Default topic preferences for a brand-new user — opt-in to the actionable ones. */
export function defaultTopicPrefs(): Record<TopicKey, boolean> {
  return {
    build_failed: true,
    build_succeeded: false,
    agent_completed: true,
    curation_pending: true,
    link_check_failed: true,
    scheduled_publish: true,
  };
}

interface PushStoreShape {
  tokens: DeviceToken[];
  prefs: Record<string, Record<TopicKey, boolean>>;
}

async function getStoreFilePath(): Promise<string> {
  // Mirror auth.ts: tokens are CMS-wide, not per-site.
  const configPath = process.env.CMS_CONFIG_PATH;
  if (configPath) {
    const dataDir = path.join(path.dirname(path.resolve(configPath)), "_data");
    await fs.mkdir(dataDir, { recursive: true });
    return path.join(dataDir, "device_tokens.json");
  }
  const { dataDir } = await getActiveSitePaths();
  await fs.mkdir(dataDir, { recursive: true });
  return path.join(dataDir, "device_tokens.json");
}

async function loadStore(): Promise<PushStoreShape> {
  try {
    const raw = await fs.readFile(await getStoreFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<PushStoreShape>;
    return {
      tokens: parsed.tokens ?? [],
      prefs: parsed.prefs ?? {},
    };
  } catch {
    return { tokens: [], prefs: {} };
  }
}

async function saveStore(store: PushStoreShape): Promise<void> {
  const filePath = await getStoreFilePath();
  await fs.writeFile(filePath, JSON.stringify(store, null, 2));
}

// ─── Tokens ───────────────────────────────────────────

/**
 * Register a token. If the same `(userId, token)` pair already exists,
 * just refresh `lastSeen`. Otherwise insert a new row.
 */
export async function registerDeviceToken(
  userId: string,
  platform: PushPlatform,
  token: string,
  deviceLabel?: string,
): Promise<DeviceToken> {
  const store = await loadStore();
  const existing = store.tokens.find(
    (t) => t.userId === userId && t.token === token,
  );
  const now = new Date().toISOString();
  if (existing) {
    existing.lastSeen = now;
    if (deviceLabel) existing.deviceLabel = deviceLabel;
    await saveStore(store);
    return existing;
  }
  const fresh: DeviceToken = {
    id: crypto.randomBytes(16).toString("base64url"),
    userId,
    platform,
    token,
    registeredAt: now,
    lastSeen: now,
    ...(deviceLabel ? { deviceLabel } : {}),
  };
  store.tokens.push(fresh);
  await saveStore(store);
  return fresh;
}

export async function getTokensForUser(userId: string): Promise<DeviceToken[]> {
  const store = await loadStore();
  return store.tokens.filter((t) => t.userId === userId);
}

/** Get all unique user IDs that have at least one registered token. */
export async function getAllUserIdsWithTokens(): Promise<string[]> {
  const store = await loadStore();
  return [...new Set(store.tokens.map((t) => t.userId))];
}

export async function deleteToken(tokenId: string): Promise<void> {
  const store = await loadStore();
  store.tokens = store.tokens.filter((t) => t.id !== tokenId);
  await saveStore(store);
}

/** Bulk-prune by predicate (used by push-send when FCM says a token is invalid). */
export async function deleteTokensByIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const store = await loadStore();
  const set = new Set(ids);
  store.tokens = store.tokens.filter((t) => !set.has(t.id));
  await saveStore(store);
}

// ─── Preferences ──────────────────────────────────────

export async function getTopicPrefs(
  userId: string,
): Promise<Record<TopicKey, boolean>> {
  const store = await loadStore();
  return { ...defaultTopicPrefs(), ...(store.prefs[userId] ?? {}) };
}

export async function setTopicPrefs(
  userId: string,
  patch: Partial<Record<TopicKey, boolean>>,
): Promise<Record<TopicKey, boolean>> {
  const store = await loadStore();
  const current = store.prefs[userId] ?? defaultTopicPrefs();
  store.prefs[userId] = { ...current, ...patch };
  await saveStore(store);
  return store.prefs[userId]!;
}

// ─── Test-only ────────────────────────────────────────
export async function _resetPushStore(): Promise<void> {
  await saveStore({ tokens: [], prefs: {} });
}
