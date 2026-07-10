/**
 * F159 — merge logic for the beam-site config sync endpoint.
 *
 * A site boot-pushes its full `config.collections` to webhouse.app on every
 * boot. This computes the merged collection set + a change report, so:
 *   - upsert (default) adds new + updates changed collections, NEVER deletes
 *     (a partial/buggy push can't wipe the config);
 *   - an identical re-push is a no-op (idempotent) — nothing rewritten, so the
 *     boot-push doesn't churn the config or trigger expensive re-work every boot;
 *   - `adminOnly` reports collections present on webhouse.app but absent from the
 *     payload (drift the operator should see).
 *
 * Dependency-free (only reads `.name`) so it unit-tests without the `@/` alias.
 */

export type SyncMode = "upsert" | "replace";

export interface NamedCollection {
  name: string;
  [k: string]: unknown;
}

export interface MergeResult<T> {
  merged: T[];
  added: string[];
  updated: string[];
  unchanged: string[];
  /** On webhouse.app but not in the payload. upsert: kept. replace: removed. */
  adminOnly: string[];
  /** True when `merged` differs from `existing` — i.e. a write is warranted. */
  changed: boolean;
}

/**
 * Order-insensitive-on-keys, order-SENSITIVE-on-arrays canonical string. Two
 * collection defs that differ only in object key order compare equal (so a
 * config round-tripped through the writer doesn't look "changed"), but field
 * ORDER is preserved (it's meaningful).
 */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

export function mergeCollectionsForSync<T extends NamedCollection>(
  existing: T[],
  payload: T[],
  mode: SyncMode = "upsert",
): MergeResult<T> {
  const existingByName = new Map(existing.map((c) => [c.name, c]));
  const payloadByName = new Map(payload.map((c) => [c.name, c]));

  const added: string[] = [];
  const updated: string[] = [];
  const unchanged: string[] = [];
  for (const p of payload) {
    const e = existingByName.get(p.name);
    if (!e) added.push(p.name);
    else if (stableStringify(e) === stableStringify(p)) unchanged.push(p.name);
    else updated.push(p.name);
  }
  const adminOnly = existing.filter((e) => !payloadByName.has(e.name)).map((e) => e.name);

  const merged: T[] =
    mode === "replace"
      ? payload
      : [
          // Keep existing objects when unchanged (so `changed` stays false on an
          // identical re-push); swap in the payload version when it differs.
          ...existing.map((e) => {
            const p = payloadByName.get(e.name);
            if (!p) return e;
            return stableStringify(p) === stableStringify(e) ? e : p;
          }),
          ...payload.filter((p) => !existingByName.has(p.name)),
        ];

  const changed =
    added.length > 0 || updated.length > 0 || (mode === "replace" && adminOnly.length > 0);

  return { merged, added, updated, unchanged, adminOnly, changed };
}
