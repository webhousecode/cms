/**
 * F59 phase 2 — QR code login session store.
 *
 * Discord-style cross-device login: the desktop generates a short-lived
 * sessionId, encodes it in a QR code, and waits. Any already-authenticated
 * client (mobile app in phase 3, or simply another browser tab where the
 * user is logged in) opens the approval URL, confirms, and the desktop is
 * instantly signed in.
 *
 * Storage is an in-memory Map. That's fine for single-instance deploys
 * (Fly.io with one machine, local dev). For multi-instance deploys this
 * needs to move to Redis or a DB row — wire it through the same interface
 * and nothing else changes.
 *
 * Lifecycle:
 *   created → pending → approved → claimed   (success)
 *                    └→ expired             (5 min TTL)
 *                    └→ rejected            (user said no)
 *
 * "claimed" is set atomically when the desktop exchanges the session for a
 * cookie — preventing replay if someone intercepts the QR code AND the
 * approval signal.
 */

import crypto from "crypto";

export type QrSessionStatus = "pending" | "approved" | "claimed" | "rejected" | "expired";

export interface QrSession {
  id: string;
  createdAt: number;
  expiresAt: number;
  status: QrSessionStatus;
  approvedUserId?: string;
  /** Free-form description of the desktop browser shown to the approver. */
  userAgent?: string;
}

const SESSIONS = new Map<string, QrSession>();
const TTL_MS = 5 * 60 * 1000;

/** Sweep expired sessions (called on each create). */
function sweep() {
  const now = Date.now();
  for (const [id, s] of SESSIONS) {
    if (s.expiresAt < now && s.status === "pending") {
      s.status = "expired";
    }
    // Drop fully terminal sessions older than 10 min
    if (s.expiresAt + 5 * 60 * 1000 < now) {
      SESSIONS.delete(id);
    }
  }
}

export function createQrSession(userAgent?: string): QrSession {
  sweep();
  const id = crypto.randomBytes(24).toString("base64url");
  const now = Date.now();
  const session: QrSession = {
    id,
    createdAt: now,
    expiresAt: now + TTL_MS,
    status: "pending",
    userAgent,
  };
  SESSIONS.set(id, session);
  return session;
}

export function getQrSession(id: string): QrSession | null {
  const s = SESSIONS.get(id);
  if (!s) return null;
  if (s.status === "pending" && s.expiresAt < Date.now()) {
    s.status = "expired";
  }
  return s;
}

export function approveQrSession(id: string, userId: string): QrSession {
  const s = SESSIONS.get(id);
  if (!s) throw new Error("Session not found");
  if (s.status !== "pending") throw new Error(`Session is ${s.status}`);
  if (s.expiresAt < Date.now()) {
    s.status = "expired";
    throw new Error("Session expired");
  }
  s.status = "approved";
  s.approvedUserId = userId;
  return s;
}

export function rejectQrSession(id: string): QrSession {
  const s = SESSIONS.get(id);
  if (!s) throw new Error("Session not found");
  if (s.status !== "pending") throw new Error(`Session is ${s.status}`);
  s.status = "rejected";
  return s;
}

/**
 * Atomically claim an approved session — returns the userId once and only
 * once. Subsequent calls return null. Prevents replay if the QR/sid leaks.
 */
export function claimQrSession(id: string): { userId: string } | null {
  const s = SESSIONS.get(id);
  if (!s) return null;
  if (s.status !== "approved" || !s.approvedUserId) return null;
  s.status = "claimed";
  const userId = s.approvedUserId;
  // Schedule deletion after a short grace window to allow status pollers
  // to observe the final state.
  setTimeout(() => SESSIONS.delete(id), 30_000);
  return { userId };
}

/** Test-only: clear store. */
export function _resetQrSessions() {
  SESSIONS.clear();
}
