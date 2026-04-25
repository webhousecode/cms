/**
 * F138 — Empty-admin detection.
 *
 * "Empty admin" = no real sites configured. UX uses this to hide
 * site-scoped sidebar entries, redirect site-scoped pages, and surface
 * receive-via-Beam onboarding.
 *
 * Empty when EITHER:
 * - No registry exists. The seed cms.config.ts on a fresh Fly deploy
 *   is a placeholder, not a customer-authored site. Treating it as
 *   "having a site" leads to the bug Christian flagged on 2026-04-25:
 *   sidebar shows Cockpit / Content / Media / Site Settings while
 *   /admin/sites correctly shows "No sites yet".
 * - Registry exists but every org has 0 sites.
 *
 * The transition out of empty happens when:
 * - Someone clicks "+ New site" (creates registry + site)
 * - Beam-receive auto-inits the registry (F138-D)
 *
 * Note for npm @webhouse/cms-admin standalone deployments: those users
 * typically scaffold their first site during setup, which seeds a
 * registry entry and exits empty mode. The empty UX still works for
 * them as a "first-run wizard" until they have a site.
 */
import { loadRegistry } from "./site-registry";

export async function isAdminEmpty(): Promise<boolean> {
  const registry = await loadRegistry();
  if (!registry) return true; // no registry = empty (no real sites exist)
  return registry.orgs.every((o) => o.sites.length === 0);
}
