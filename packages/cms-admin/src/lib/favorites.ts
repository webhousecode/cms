import type { Favorite } from "@/lib/user-state";

/**
 * Client-safe favorites helpers.
 *
 * NOTE: `lib/user-state.ts` imports `fs` (server-only), so it can only ever be
 * used for its `Favorite` *type* on the client. This module holds the runtime
 * helpers that client components need.
 */

const FAVORITE_TYPES: readonly Favorite["type"][] = [
  "document",
  "collection",
  "page",
  "tool",
  "interactive",
];

/**
 * Coerce persisted favorites (localStorage cache OR server JSON) into a
 * well-formed `Favorite[]`.
 *
 * Persisted data can predate the current shape or carry a legacy entry with a
 * missing `label`/`path`. Any search filter over such data then crashes on
 * `f.label.toLowerCase()` — which took down the whole admin app the moment an
 * editor typed in the ⌘K command palette (F161.5). Validating at the trust
 * boundary lets every downstream consumer rely on the `Favorite` type.
 */
export function sanitizeFavorites(raw: unknown): Favorite[] {
  if (!Array.isArray(raw)) return [];
  const out: Favorite[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const path = typeof o.path === "string" ? o.path : "";
    if (!path) continue; // a favorite with no admin route is unusable
    out.push({
      id: typeof o.id === "string" && o.id ? o.id : path,
      type: FAVORITE_TYPES.includes(o.type as Favorite["type"])
        ? (o.type as Favorite["type"])
        : "page",
      label: typeof o.label === "string" && o.label ? o.label : path,
      path,
      icon: typeof o.icon === "string" ? o.icon : undefined,
      collection: typeof o.collection === "string" ? o.collection : undefined,
      slug: typeof o.slug === "string" ? o.slug : undefined,
      addedAt: typeof o.addedAt === "string" ? o.addedAt : "",
    });
  }
  return out;
}
