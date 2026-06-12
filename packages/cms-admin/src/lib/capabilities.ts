/**
 * F153 — server-only capability helpers (the security boundary).
 *
 * Mirrors permissions.ts: the client hook (hooks/use-capabilities.ts) is UX
 * only; THIS is where a feature is actually gated server-side. Phase 2 wires
 * requireCapability() into /api routes + server pages. The catalog + resolution
 * live in the server/client-safe capabilities-shared.ts.
 */
import { NextResponse } from "next/server";
import { readSiteConfig } from "./site-config";
import { resolveCapabilities, hasCapability, type CapabilityMap } from "./capabilities-shared";

/** Effective capabilities for the active tenant (default ON, requires-cascade applied). */
export async function getCapabilities(): Promise<CapabilityMap> {
  const cfg = await readSiteConfig();
  return resolveCapabilities(cfg.capabilities);
}

/**
 * API guard: returns a 404 Response when the capability is OFF for this tenant,
 * else null. 404 (not 403) so a disabled feature looks like it doesn't exist.
 * Usage (Phase 2): `const denied = await requireCapability("ai"); if (denied) return denied;`
 */
export async function requireCapability(key: string): Promise<Response | null> {
  const caps = await getCapabilities();
  if (hasCapability(caps, key)) return null;
  return NextResponse.json({ error: "This feature is not enabled for this site" }, { status: 404 });
}
