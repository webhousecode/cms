import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { resolveJwtSecret } from "@/lib/dev-jwt-secret";

/**
 * F151 — Lens mint-endpoint (fleet `mintEndpoint` standard).
 *
 * `POST /api/lens-session`
 * - Auth: `Authorization: Bearer <LENS_MINT_SECRET>` → 401 on missing/wrong.
 *   This secret ONLY authorizes minting a lens session; it is NOT an admin token.
 * - Mints a short-lived (~10 min), read-only `cms-session` JWT for the dedicated
 *   lens principal (`lens@webhouse.app`, role admin so it can RENDER admin
 *   surfaces — never cb@webhouse.dk, never a real user). Read-only is enforced by
 *   the `lens:true` write-guard in proxy.ts, NOT by the role.
 * - Optional body `{ org, site }` — validated against the registry — targets
 *   ANY site's admin pages on demand (was env-only before 2026-07-02; a
 *   single-site LENS_ACTIVE_ORG/SITE meant every other site's admin pages
 *   404'd into NoAccessGate, which is what led to a fabricated screenshot
 *   that night instead of an honest "can't verify"). Falls back to
 *   LENS_ACTIVE_ORG/LENS_ACTIVE_SITE env vars when omitted.
 * - Returns a Playwright `storageState` the Lens daemon applies verbatim.
 *
 * Contract: broberg-ai/cardmem/docs/LENS-MINT-ENDPOINT.md — the org/site body
 * param and the admin/(workspace)/layout.tsx membership-gate whitelist for
 * sub:"lens" (added alongside this) should both land in the canonical
 * contract too, so every app implementing this endpoint gets the fix, not
 * just this repo.
 */

const TTL_SECONDS = 600; // ~10 minutes — cookie + JWT share this expiry

function getJwtSecret(): Uint8Array {
  // Same secret + fallback as proxy.ts so the minted cookie validates 1:1.
  return new TextEncoder().encode(
    resolveJwtSecret(),
  );
}

/**
 * Cookie domain from the request Host (or an explicit LENS_COOKIE_DOMAIN) —
 * NEVER the bound address. On Fly the app binds 0.0.0.0; deriving the domain
 * from the socket would store the cookie under "0.0.0.0" and the browser would
 * never send it to the real host → a silent false-green capture of the public
 * shell. (cardmem mint-endpoint doc, sa 2026-06-05.)
 */
function cookieDomain(request: NextRequest): string {
  const explicit = process.env.LENS_COOKIE_DOMAIN;
  if (explicit) return explicit;
  return (request.headers.get("host") ?? "").split(":")[0];
}

/**
 * Active org/site for the minted session so site-scoped surfaces render instead
 * of an empty workspace. Priority: an explicit `{org, site}` in the POST body
 * (validated against the registry — Lens can target ANY site on demand this
 * way, not just one fixed env-configured site) — then LENS_ACTIVE_ORG/
 * LENS_ACTIVE_SITE env vars — then unset (`?site=<id>` still resolves for
 * API-route captures, since proxy.ts handles that independently).
 */
async function resolveActiveSite(
  requested: { org?: unknown; site?: unknown } | null,
): Promise<{ org: string; site: string } | null> {
  if (typeof requested?.org === "string" && typeof requested?.site === "string") {
    const { loadRegistry, findSite } = await import("@/lib/site-registry");
    const registry = await loadRegistry();
    if (registry && findSite(registry, requested.org, requested.site)) {
      return { org: requested.org, site: requested.site };
    }
  }
  const org = process.env.LENS_ACTIVE_ORG;
  const site = process.env.LENS_ACTIVE_SITE;
  return org && site ? { org, site } : null;
}

/**
 * Which of the two Lens keys was presented (F151.2).
 *
 * Christian asked for "one that can only look and one that can only write".
 * A write-only key cannot exist here: Lens drives a browser, so it must READ
 * the page to find the button and read the value back to prove the save. So the
 * split is look-only vs look-and-save, and the value of the split is untouched —
 * a leaked look-only secret still costs only looking.
 *
 * The two secrets must differ. If someone sets them to the same value the
 * look-only key silently gains write access, which is exactly what the split
 * exists to prevent — so that configuration is refused, loudly.
 *
 * NOTE vs the fleet contract (cardmem F213): the canonical mint endpoint
 * distinguishes the two principals by the request BODY alone, on one shared
 * bearer. We honour that body contract so the Lens daemon drives us unchanged,
 * but we additionally require a SEPARATE bearer for write mode — Christian's
 * explicit decision, and strictly stronger: with one shared secret, leaking the
 * look-only key would also hand out write sessions.
 */
function resolveLensKey(bearer: string | null): "none" | "read" | "write" {
  const read = process.env.LENS_MINT_SECRET;
  const write = process.env.LENS_WRITE_SECRET;
  if (!bearer) return "none";
  if (write && read && write === read) {
    console.error(
      "[lens] LENS_WRITE_SECRET is identical to LENS_MINT_SECRET — refusing to mint a " +
        "write session. The two keys exist to be different; set a distinct value.",
    );
    return read === bearer ? "read" : "none";
  }
  // Ship dark: with no LENS_WRITE_SECRET set, a write session cannot be minted
  // at all, so a machine that never opted in cannot hand one out.
  if (write && bearer === write) return "write";
  if (read && bearer === read) return "read";
  return "none";
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const kind = resolveLensKey(bearer);
  if (kind === "none") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { org?: string; site?: string; mode?: string; writes?: boolean; flow?: string }
    | null;

  // Fleet contract (cardmem F213): write mode is asked for explicitly, and
  // `mode:"write"` WITHOUT `writes:true` is refused rather than quietly
  // downgraded. Silently handing back a read-only session would hide a broken
  // write flow; silently minting a write session is the footgun. An unclear
  // request fails loudly instead of guessing either way.
  const wantsWrite = body?.mode === "write";
  if (wantsWrite && body?.writes !== true) {
    return NextResponse.json({ error: "write_mode_requires_writes_true" }, { status: 400 });
  }
  if (wantsWrite && kind !== "write") {
    return NextResponse.json({ error: "write_mode_requires_write_key" }, { status: 403 });
  }
  // The write key alone does not make a session writable — the caller must ASK.
  // So a flow that only looks cannot write by accident just because it was
  // handed the stronger key.
  const writeSession = wantsWrite && kind === "write";
  if (writeSession) {
    console.log(
      `[lens] write session minted — flow=${body?.flow ?? "(unnamed)"} ` +
        `site=${body?.site ?? "(default)"} at ${new Date().toISOString()}`,
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const expires = now + TTL_SECONDS;
  const token = await new SignJWT({
    sub: "lens",
    // A SEPARATE identity for the write principal, per the fleet contract —
    // not the same user with a flag, so an audit trail can tell them apart.
    email: writeSession
      ? process.env.LENS_WRITE_PRINCIPAL_EMAIL || "lens-write@webhouse.app"
      : "lens@webhouse.app",
    name: writeSession ? "Lens (write)" : "Lens",
    role: "admin",
    // ADDITIVE on purpose: a write session carries lens:true TOO, so everything
    // that identifies a Lens session by `lens === true` keeps working. Changing
    // `lens` to a string instead would have quietly altered the meaning of every
    // existing comparison, and that kind of mistake is silent.
    lens: true,
    ...(writeSession ? { lensWrite: true } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(expires)
    .sign(getJwtSecret());

  const domain = cookieDomain(request);
  const sessionCookie = {
    name: "cms-session",
    value: token,
    domain,
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax" as const,
    expires,
  };

  const cookies: Array<typeof sessionCookie> = [sessionCookie];
  const active = await resolveActiveSite(body);
  if (active) {
    // active-org/site are read client-side too → not httpOnly (matches the app).
    cookies.push({ ...sessionCookie, name: "cms-active-org", value: active.org, httpOnly: false });
    cookies.push({ ...sessionCookie, name: "cms-active-site", value: active.site, httpOnly: false });
  }

  return NextResponse.json({ cookies, origins: [] });
}

export function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
