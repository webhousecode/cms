/**
 * F153 — Per-tenant capabilities (feature toggles per customer).
 *
 * A SECOND axis, orthogonal to roles/permissions:
 *   - permission (permissions-shared.ts) gates "can THIS USER do X?"
 *   - capability (this file)            gates "does THIS TENANT have feature X at all?"
 * They compose: a feature is available only when
 *   tenantHasCapability(cap) && userHasPermission(perm).
 *
 * Deliberately server/client safe — no next/headers, no cookies. The
 * server-only `requireCapability()` guard lives in capabilities.ts; the client
 * hook lives in hooks/use-capabilities.ts.
 *
 * Backward compatibility is load-bearing: an UNSET capability resolves to ON,
 * so every existing tenant (no `capabilities` in site-config) behaves exactly
 * as today (= the "full" profile). Turning a capability OFF is opt-in.
 */

export interface CapabilityDef {
  /** Human label for the Settings → Features toggle. */
  label: string;
  /** One-line description of what turning it off hides. */
  description: string;
  /** Capability keys that must also be on; if a required parent is off, this
   *  capability is forced off regardless of its own flag (e.g. agents/chat need ai).
   *  Typed as string[] to avoid a circular type with CapabilityKey; the runtime
   *  cascade + a test assert every entry is a real capability key. */
  requires?: string[];
}

/**
 * Coarse capability groups (F153 §5 — coarse-first). Content + Media are the
 * always-on CORE and are intentionally NOT in this catalog: even the "minimal"
 * profile keeps them. Finer per-feature toggles can be added later without
 * reworking the gates.
 */
export const CAPABILITIES = {
  ai: {
    label: "AI features",
    description: "AI generate, proofread, SEO assistance, image analysis — the whole AI surface.",
  },
  seo: {
    label: "SEO & visibility",
    description: "SEO dashboard, scores and the visibility/GEO view.",
  },
  maps: {
    label: "Maps",
    description: "Map field type and map editing.",
  },
  interactives: {
    label: "Interactives",
    description: "Embeddable HTML interactives.",
  },
  forms: {
    label: "Forms",
    description: "Form inbox and form builder.",
  },
  scheduling: {
    label: "Scheduled publishing",
    description: "Schedule documents to publish/unpublish later.",
  },
  quality: {
    label: "Quality tools",
    description: "Link checker, Lighthouse and performance reports.",
  },
  backup: {
    label: "Backup & restore",
    description: "Content backup and restore.",
  },
  agents: {
    label: "AI agents",
    description: "Automated content-generation agents and workflows.",
    requires: ["ai"],
  },
  chat: {
    label: "Chat",
    description: "Chat-to-edit your site.",
    requires: ["ai"],
  },
} as const satisfies Record<string, CapabilityDef>;

export type CapabilityKey = keyof typeof CAPABILITIES;

/** Effective capability map: every key present, resolved to a boolean. */
export type CapabilityMap = Record<CapabilityKey, boolean>;

export const CAPABILITY_KEYS = Object.keys(CAPABILITIES) as CapabilityKey[];

/** One-click presets. A profile just sets the booleans; each cap stays
 *  individually tweakable afterwards. */
export const CAPABILITY_PROFILES = {
  /** Stripped-down CMS — just content + media (the core). */
  minimal: fromKeys(() => false),
  /** Capable but not overwhelming — content/media + SEO + forms + scheduling. */
  standard: fromKeys((k) => k === "seo" || k === "forms" || k === "scheduling"),
  /** Everything (= the current behaviour, and the default for existing tenants). */
  full: fromKeys(() => true),
} as const satisfies Record<string, CapabilityMap>;

export type CapabilityProfile = keyof typeof CAPABILITY_PROFILES;

function fromKeys(fn: (k: CapabilityKey) => boolean): CapabilityMap {
  const out = {} as CapabilityMap;
  for (const k of Object.keys(CAPABILITIES) as CapabilityKey[]) out[k] = fn(k);
  return out;
}

/**
 * Resolve the effective capabilities for a tenant from its (partial) stored
 * flags. Applies two rules:
 *   1. Default ON — an unset key is enabled (backward compatible).
 *   2. Requires-cascade — a capability whose required parent is off is forced off.
 */
export function resolveCapabilities(stored: Partial<Record<CapabilityKey, boolean>> | undefined | null): CapabilityMap {
  const resolved = fromKeys((k) => stored?.[k] ?? true);
  // Cascade: a capability with an off `requires` parent can't be on.
  for (const k of Object.keys(CAPABILITIES) as CapabilityKey[]) {
    const reqs = (CAPABILITIES[k] as CapabilityDef).requires;
    if (reqs && reqs.some((r) => !resolved[r as CapabilityKey])) resolved[k] = false;
  }
  return resolved;
}

/** Is a capability enabled for this resolved map? Unknown keys → true (fail-open
 *  for capabilities the catalog doesn't know — never block on a typo). */
export function hasCapability(resolved: CapabilityMap, key: string): boolean {
  if (!(key in CAPABILITIES)) return true;
  return resolved[key as CapabilityKey];
}

/** Which named profile (if any) the resolved map matches — else "custom". */
export function capabilityProfile(resolved: CapabilityMap): CapabilityProfile | "custom" {
  for (const [name, profile] of Object.entries(CAPABILITY_PROFILES) as [CapabilityProfile, CapabilityMap][]) {
    if (CAPABILITY_KEYS.every((k) => profile[k] === resolved[k])) return name;
  }
  return "custom";
}
