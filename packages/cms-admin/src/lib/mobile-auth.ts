/**
 * Mobile auth helper — Bearer JWT extraction.
 *
 * The webhouse.app mobile app authenticates via `Authorization: Bearer <jwt>`
 * headers, NOT cookies. This helper mirrors `getSessionUser` from `auth.ts`
 * but reads from the request headers instead of cookies.
 *
 * The JWT format and signing key are identical to the web session — minted
 * by `createToken(user)` in `auth.ts`. That means a single user record and
 * a single audit trail across both surfaces.
 *
 * See `CLAUDE.md` § "Hard Rule: Mobile App is Server-Agnostic" for the
 * contract this helper enforces.
 */

import type { NextRequest } from "next/server";
import { verifyToken, type SessionPayload } from "./auth";

export type MobileSession = SessionPayload & { id: string };

export async function getMobileSession(req: NextRequest): Promise<MobileSession | null> {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!auth) return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  if (!match) return null;
  const token = match[1]!.trim();
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  return { ...payload, id: payload.sub };
}
