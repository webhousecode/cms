/**
 * Security W41 C3 — every /api/mobile/* route takes ?orgId=&siteId= from the
 * caller and only verified the Bearer JWT's signature: any signed-in user could
 * read and write any tenant's content, media and chat through the mobile API.
 *
 * Decided once, in the proxy, for every mobile route (so a new one inherits
 * it): the caller must be on that site's team, and a viewer may only read.
 */
import { isSafeId } from "./active-site-cookie";

export type MobileAccessDecision = { status: 400 | 403 | 404; error: string } | null;

/** Pure: given the caller's role on the named site (null = no membership). */
export function decideMobileAccess(method: string, role: string | null): MobileAccessDecision {
  if (!role) return { status: 403, error: "No access to that site" };
  const read = method === "GET" || method === "HEAD" || method === "OPTIONS";
  if (!read && role === "viewer") return { status: 403, error: "No write access" };
  return null;
}

/**
 * Full check for a mobile request that names a site. Returns null when there
 * is nothing to decide here (no site named, or no Bearer — the route answers
 * 401 itself) or the caller may proceed.
 */
export async function checkMobileSiteAccess(input: {
  method: string;
  orgId: string | null;
  siteId: string | null;
  bearer: string | null;
}): Promise<MobileAccessDecision> {
  const { orgId, siteId, bearer, method } = input;
  if (!orgId && !siteId) return null;
  if (!bearer) return null;
  if (!isSafeId(orgId) || !isSafeId(siteId)) return { status: 400, error: "Invalid orgId or siteId" };

  const { verifyToken } = await import("./auth");
  const payload = await verifyToken(bearer);
  if (!payload) return null; // the route itself answers 401
  if ((payload as { editSession?: unknown }).editSession === true) return { status: 403, error: "Inline-edit session is not a mobile login" };

  const { loadRegistry, findSite } = await import("./site-registry");
  const registry = await loadRegistry();
  if (registry && !findSite(registry, orgId, siteId)) return { status: 404, error: "Site not found" };

  const { isSelfDescribingPrincipal } = await import("./require-role");
  let role: string | null;
  if (isSelfDescribingPrincipal(payload.sub)) {
    role = payload.role ?? null;
  } else {
    const { getTeamMembersForSite } = await import("./team");
    const members = await getTeamMembersForSite(orgId, siteId);
    role = members.find((m) => m.userId === payload.sub)?.role ?? null;
  }
  return decideMobileAccess(method, role);
}
