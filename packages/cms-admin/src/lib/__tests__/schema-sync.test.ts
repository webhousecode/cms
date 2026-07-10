/**
 * F159 — beam-site config sync merge logic.
 *
 * The load-bearing guarantees: upsert never deletes (a partial boot-push can't
 * wipe the tenant config), an identical re-push is a no-op (no rewrite churn),
 * and key-order differences from a config round-trip don't look like changes.
 *
 * Run: cd packages/cms-admin && npx vitest run src/lib/__tests__/schema-sync.test.ts
 */
import { describe, it, expect } from "vitest";
import { mergeCollectionsForSync, stableStringify } from "../schema-sync";

const col = (name: string, extra: Record<string, unknown> = {}) => ({ name, ...extra });

describe("mergeCollectionsForSync — upsert (default)", () => {
  it("adds a missing collection, keeps existing ones", () => {
    const existing = [col("a"), col("b")];
    const payload = [col("a"), col("b"), col("c")];
    const r = mergeCollectionsForSync(existing, payload);
    expect(r.added).toEqual(["c"]);
    expect(r.updated).toEqual([]);
    expect(r.changed).toBe(true);
    expect(r.merged.map((c) => c.name)).toEqual(["a", "b", "c"]);
  });

  it("updates a changed collection (swaps in the payload version)", () => {
    const existing = [col("a", { label: "Old" })];
    const payload = [col("a", { label: "New" })];
    const r = mergeCollectionsForSync(existing, payload);
    expect(r.updated).toEqual(["a"]);
    expect(r.changed).toBe(true);
    expect((r.merged[0] as Record<string, unknown>).label).toBe("New");
  });

  it("NEVER deletes: a payload omitting an existing collection keeps it + reports it in adminOnly", () => {
    const existing = [col("a"), col("b"), col("keepme")];
    const payload = [col("a"), col("b")];
    const r = mergeCollectionsForSync(existing, payload);
    expect(r.adminOnly).toEqual(["keepme"]);
    expect(r.merged.map((c) => c.name)).toContain("keepme");
    // a+b unchanged and keepme kept → nothing to write
    expect(r.changed).toBe(false);
  });

  it("identical re-push is a no-op (changed=false, all unchanged)", () => {
    const existing = [col("a", { fields: [{ name: "t", type: "text" }] }), col("b")];
    const payload = [col("a", { fields: [{ name: "t", type: "text" }] }), col("b")];
    const r = mergeCollectionsForSync(existing, payload);
    expect(r.changed).toBe(false);
    expect(r.unchanged.sort()).toEqual(["a", "b"]);
    expect(r.added).toEqual([]);
    expect(r.updated).toEqual([]);
  });

  it("treats key-order differences as unchanged, not updated", () => {
    const existing = [{ name: "a", label: "X", urlPrefix: "/a" }];
    const payload = [{ urlPrefix: "/a", name: "a", label: "X" }]; // same data, different key order
    const r = mergeCollectionsForSync(existing, payload);
    expect(r.unchanged).toEqual(["a"]);
    expect(r.updated).toEqual([]);
    expect(r.changed).toBe(false);
  });

  it("empty payload is a no-op that deletes nothing (route guards it separately)", () => {
    const existing = [col("a"), col("b")];
    const r = mergeCollectionsForSync(existing, []);
    expect(r.merged.map((c) => c.name)).toEqual(["a", "b"]);
    expect(r.adminOnly.sort()).toEqual(["a", "b"]);
    expect(r.changed).toBe(false);
  });
});

describe("mergeCollectionsForSync — replace (opt-in)", () => {
  it("removes collections absent from the payload", () => {
    const existing = [col("a"), col("b"), col("gone")];
    const payload = [col("a"), col("b")];
    const r = mergeCollectionsForSync(existing, payload, "replace");
    expect(r.merged.map((c) => c.name)).toEqual(["a", "b"]);
    expect(r.adminOnly).toEqual(["gone"]);
    expect(r.changed).toBe(true);
  });
});

describe("stableStringify", () => {
  it("is key-order insensitive but array-order sensitive", () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });
});
