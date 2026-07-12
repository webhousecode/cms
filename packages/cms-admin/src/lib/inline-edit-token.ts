import { SignJWT } from "jose";

/**
 * F157 — the single source of truth for minting inline-edit `editSession`
 * tokens. Used by BOTH the interactive connect flow
 * (`/admin/inline-edit/connect`) and the headless mint endpoint
 * (`POST /api/inline-edit/token`) so the token contract can never drift between
 * the two paths.
 *
 * The token is SITE-scoped (not per-document): an editor who connects for one
 * document can fix any field across the whole site in one pass. It is verified
 * by proxy.ts's editSession allowlist, which only permits GET/PATCH on
 * `/api/cms/*` plus `GET /api/auth/me` — so the token cannot do anything the
 * caller's own `content.edit` permission couldn't already do.
 */

/** 30 days — long enough that an editor keeps a working session between visits. */
export const EDIT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function getJwtSecret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.CMS_JWT_SECRET ?? "cms-dev-secret-change-me-in-production",
  );
}

export interface EditSessionClaims {
  userId: string;
  email: string;
  name: string;
  /** The caller's role on the site (falls back to "editor"). */
  role?: string;
  siteId: string;
}

/** Mint a signed, site-scoped editSession JWT. Returns { token, expiresIn }. */
export async function mintEditSessionToken(
  claims: EditSessionClaims,
): Promise<{ token: string; expiresIn: number }> {
  const now = Math.floor(Date.now() / 1000);
  const expires = now + EDIT_SESSION_TTL_SECONDS;
  const token = await new SignJWT({
    sub: claims.userId,
    email: claims.email,
    name: claims.name,
    role: claims.role ?? "editor",
    editSession: true,
    site: claims.siteId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(expires)
    .sign(getJwtSecret());
  return { token, expiresIn: EDIT_SESSION_TTL_SECONDS };
}
