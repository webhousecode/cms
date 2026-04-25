/**
 * F138 — Empty-admin detection.
 *
 * "Empty admin" = a registry-backed CMS with zero sites across all orgs.
 * UX uses this to hide site-scoped sidebar entries, redirect site-scoped
 * pages, and surface receive-via-Beam onboarding.
 *
 * NOT empty:
 * - Single-site mode (no registry.json) — the seed cms.config.ts counts
 *   as a site for nav purposes. Existing single-site deployments must
 *   not see a UX regression.
 * - Multi-site mode with ≥1 site in any org.
 *
 * Empty:
 * - Multi-site mode (registry.json exists) where every org has 0 sites.
 *
 * The transition single-site → multi-site happens when someone clicks
 * "+ New site" or completes a Beam-receive (F138-D auto-init).
 */
import { loadRegistry } from "./site-registry";

export async function isAdminEmpty(): Promise<boolean> {
  const registry = await loadRegistry();
  if (!registry) return false; // single-site mode is NOT empty (seed config = site)
  return registry.orgs.every((o) => o.sites.length === 0);
}
