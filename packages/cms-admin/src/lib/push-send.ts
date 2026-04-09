/**
 * F07 Phase 2 — push send helper.
 *
 * Dual transport:
 *   - ios/android tokens → Firebase Cloud Messaging via firebase-admin SDK
 *   - web tokens → Web Push API via web-push library + VAPID keys
 *
 * Both libraries are loaded lazily via dynamic import so this module
 * stays usable even if the deps aren't installed yet (returns
 * `{ ok: false, reason: "transport-not-configured" }` instead of throwing).
 *
 * To activate:
 *   1. `pnpm add firebase-admin web-push` in packages/cms-admin
 *   2. Set env vars (see below)
 *   3. Restart cms-admin
 *
 * Required env vars (Phase 2b — user provides):
 *   - FIREBASE_PROJECT_ID         e.g. webhouse-app
 *   - FIREBASE_CLIENT_EMAIL       service account email
 *   - FIREBASE_PRIVATE_KEY        service account private key (PEM, escaped \n)
 *   - VAPID_PUBLIC_KEY            for web push (generate via web-push CLI)
 *   - VAPID_PRIVATE_KEY
 *   - VAPID_SUBJECT               mailto: or https:// identity
 *
 * Audit logging is intentionally NOT in this module — callers should log
 * via the existing audit mechanism (Phase 4).
 */

import {
  deleteTokensByIds,
  getTokensForUser,
  getTopicPrefs,
  type TopicKey,
} from "./push-store";

export interface PushPayload {
  title: string;
  body: string;
  /** Topic — gates whether the user wants to receive this kind of push */
  topic: TopicKey;
  /** Deep link target inside the mobile app, e.g. /site/foo/bar */
  url?: string;
  /** Optional structured data forwarded to the device */
  data?: Record<string, string>;
  /** Override the badge count instead of using the user's unread count */
  badge?: number;
}

export interface PushResult {
  ok: boolean;
  sent: number;
  failed: number;
  skipped: number;
  reason?: string;
}

// ─── Lazy transport loaders ───────────────────────────

let firebaseMessaging: unknown | null = null;
let firebaseLoadFailed = false;

async function getMessaging(): Promise<unknown | null> {
  if (firebaseLoadFailed) return null;
  if (firebaseMessaging) return firebaseMessaging;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    firebaseLoadFailed = true;
    return null;
  }

  try {
    // firebase-admin is an optional dep — cast through unknown to avoid
    // strict type errors when it IS installed (the default-export shape
    // doesn't match CJS vs ESM assumptions).
    const admin = await import("firebase-admin");
    const adm = ((admin as unknown as { default?: unknown }).default ?? admin) as typeof admin;
    // Initialize once per process
    if (!adm.apps?.length) {
      // @ts-ignore — typed by admin module if installed
      adm.initializeApp({
        // @ts-ignore — typed by admin module if installed
        credential: adm.credential.cert({ projectId, clientEmail, privateKey }),
      });
    }
    // @ts-ignore — typed by admin module if installed
    firebaseMessaging = adm.messaging();
    return firebaseMessaging;
  } catch (err) {
    console.warn("[push] firebase-admin not available:", (err as Error).message);
    firebaseLoadFailed = true;
    return null;
  }
}

let webpushReady = false;
let webpushLoadFailed = false;
let webpushModule: unknown | null = null;

async function getWebPush(): Promise<unknown | null> {
  if (webpushLoadFailed) return null;
  if (webpushReady && webpushModule) return webpushModule;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:noreply@webhouse.app";
  if (!publicKey || !privateKey) {
    webpushLoadFailed = true;
    return null;
  }

  try {
    // @ts-ignore — web-push is an optional dep
    const wp = await import("web-push");
    const lib = (wp as { default?: typeof wp }).default ?? wp;
    // @ts-ignore — typed if installed
    lib.setVapidDetails(subject, publicKey, privateKey);
    webpushModule = lib;
    webpushReady = true;
    return lib;
  } catch (err) {
    console.warn("[push] web-push not available:", (err as Error).message);
    webpushLoadFailed = true;
    return null;
  }
}

// ─── Public API ───────────────────────────────────────

/**
 * Send a push notification to all of a user's registered devices,
 * gated by their topic preferences. Cleans up invalid tokens.
 */
export async function sendPushNotification(
  userId: string,
  payload: PushPayload,
): Promise<PushResult> {
  const prefs = await getTopicPrefs(userId);
  if (!prefs[payload.topic]) {
    return { ok: true, sent: 0, failed: 0, skipped: 1, reason: "topic-disabled" };
  }

  const tokens = await getTokensForUser(userId);
  if (tokens.length === 0) {
    return { ok: true, sent: 0, failed: 0, skipped: 0, reason: "no-tokens" };
  }

  const messaging = await getMessaging();
  const wp = await getWebPush();

  if (!messaging && !wp) {
    return {
      ok: false,
      sent: 0,
      failed: 0,
      skipped: tokens.length,
      reason: "no-transport-configured",
    };
  }

  const dead: string[] = [];
  let sent = 0;
  let failed = 0;

  for (const t of tokens) {
    const isMobile = t.platform === "ios" || t.platform === "android";
    const isWeb = t.platform === "web";

    if (isMobile && messaging) {
      try {
        // @ts-ignore — typed by firebase-admin if installed
        await messaging.send({
          token: t.token,
          notification: { title: payload.title, body: payload.body },
          data: { ...payload.data, ...(payload.url ? { url: payload.url } : {}) },
          apns: {
            payload: {
              aps: {
                badge: payload.badge,
                sound: "default",
              },
            },
          },
          android: {
            priority: "high",
            notification: { sound: "default" },
          },
        });
        sent++;
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token" ||
          code === "messaging/invalid-argument"
        ) {
          dead.push(t.id);
        } else {
          console.error("[push] FCM send error:", err);
        }
        failed++;
      }
    } else if (isWeb && wp) {
      try {
        const sub = JSON.parse(t.token);
        const body = JSON.stringify({
          title: payload.title,
          body: payload.body,
          url: payload.url ?? "/",
          tag: `webhouse-${Date.now()}`,
          badge: payload.badge,
        });
        // @ts-ignore — typed by web-push if installed
        await wp.sendNotification(sub, body);
        sent++;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 410 || status === 404) {
          dead.push(t.id);
        } else {
          console.error("[push] web push send error:", err);
        }
        failed++;
      }
    }
  }

  if (dead.length > 0) {
    await deleteTokensByIds(dead);
    console.log(`[push] cleaned up ${dead.length} invalid tokens for user ${userId}`);
  }

  return {
    ok: sent > 0 || tokens.length === 0,
    sent,
    failed,
    skipped: 0,
  };
}
