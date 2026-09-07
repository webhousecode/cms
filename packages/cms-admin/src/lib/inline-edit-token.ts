import { SignJWT } from "jose";
import { resolveJwtSecret } from "./dev-jwt-secret";

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
    resolveJwtSecret(),
  );
}

export interface EditSessionClaims {
  userId: string;
  email: string;
  name: string;
  /** The caller's role on the site (falls back to "editor"). */
  role?: string;
  siteId: string;
  /** Carried from the MINTING session — see mintEditSessionToken. */
  lens?: boolean;
  lensWrite?: boolean;
}

/**
 * F157.17 — a read-only Lens session must not be able to mint itself a token
 * that CAN write.
 *
 * proxy.ts's read-only boundary is one expression, `lens === true &&
 * lensWrite !== true`, and it can only see a mark that is IN the token it is
 * shown. Minting drops the mark, and minting is a GET — so the method guard
 * (POST/PUT/PATCH/DELETE) never looks at it. Measured against production
 * 7 Sep 2026: the same identity was refused a direct PATCH with 403 and then
 * granted one through `/admin/inline-edit/connect`, four calls apart.
 *
 * Both doors call this. A closed door beside an open one is not a door.
 */
export function isReadOnlyLensSession(
  claims: { lens?: unknown; lensWrite?: unknown } | null | undefined,
): boolean {
  return !!claims && claims.lens === true && claims.lensWrite !== true;
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
    // Carry the Lens marks INTO the token. Second layer, on purpose: the
    // refusal above is what works today; this is what still works when someone
    // adds a third minting path and never reads the first. Without it the
    // minted token is unmarked BY CONSTRUCTION, so proxy.ts's guard is blind to
    // it no matter which door it came out of.
    ...(claims.lens ? { lens: true } : {}),
    ...(claims.lensWrite ? { lensWrite: true } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(expires)
    .sign(getJwtSecret());
  return { token, expiresIn: EDIT_SESSION_TTL_SECONDS };
}
