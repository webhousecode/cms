/**
 * Wire types for /api/mobile/* endpoints.
 *
 * These mirror the response shape returned by cms-admin and are
 * the contract between mobile and server. Keep in sync with
 * packages/cms-admin/src/app/api/mobile/* route handlers.
 */

export interface MobilePingResponse {
  ok: true;
  product: "webhouse-cms";
  serverVersion: string;
  /** Whether QR pairing is enabled on this server */
  pairingEnabled: boolean;
}

export interface MobilePairExchangeResponse {
  jwt: string;
  expiresAt: string; // ISO timestamp
  user: MobileUser;
}

export interface MobileUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface MobileSite {
  orgId: string;
  orgName: string;
  siteId: string;
  siteName: string;
  role: "owner" | "admin" | "editor" | "viewer";
  /** Public preview URL — used by the mobile Site screen's iframe thumb */
  previewUrl?: string;
}

export interface MobileMeResponse {
  user: MobileUser;
  sites: MobileSite[];
  /** User's last active org id from the desktop session, if any. */
  lastActiveOrg?: string;
  /** User's last active site id from the desktop session, if any. */
  lastActiveSite?: string;
  counters: {
    curationPending: number;
    draftsToday: number;
  };
  serverVersion: string;
}
