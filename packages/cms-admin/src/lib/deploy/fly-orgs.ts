/**
 * F200.3 — the deploy wizard's "Verify token" step.
 *
 * It used to POST to api.fly.io/graphql straight from the browser. All Fly
 * calls from code go through @broberg/deploy-core (Christian 29/9), so the
 * wizard now asks our server, which asks FlyClient.listOrgs().
 *
 * An empty org list is a failure, not a success: a token that can see no
 * organisation cannot deploy anything, and a green "verified" over an empty
 * picker is the silent version of that.
 */
import { FlyApiError, FlyClient } from "@broberg/deploy-core";

export type FlyOrgsResult =
  | { ok: true; orgs: Array<{ slug: string; name: string }> }
  | { ok: false; status: number; error: string };

export async function listFlyOrgsForToken(token: string, fetchImpl?: typeof fetch): Promise<FlyOrgsResult> {
  if (!token.trim()) return { ok: false, status: 400, error: "Missing Fly API token" };
  try {
    const orgs = await new FlyClient({ token, ...(fetchImpl ? { fetch: fetchImpl } : {}) }).listOrgs();
    if (orgs.length === 0) return { ok: false, status: 422, error: "No organizations found for this token" };
    return { ok: true, orgs: orgs.map((o) => ({ slug: o.slug, name: o.name })) };
  } catch (err) {
    if (err instanceof FlyApiError && (err.status === 401 || err.status === 403)) {
      return { ok: false, status: 401, error: "Fly rejected this token" };
    }
    // Never echo Fly's body to the client — it can carry request details.
    console.error("[fly-orgs] listOrgs failed:", err instanceof Error ? err.message : err);
    return { ok: false, status: 502, error: "Could not reach Fly to verify the token" };
  }
}
