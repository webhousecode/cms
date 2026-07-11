/**
 * Regression test for F161.5: a persisted favorite with a missing `label`
 * crashed the whole admin app the moment an editor typed in the ⌘K command
 * palette — the search filter ran `f.label.toLowerCase()` on `undefined`.
 * sanitizeFavorites() validates persisted data at the trust boundary so every
 * downstream search filter is safe.
 */
import { describe, it, expect } from "vitest";
import { sanitizeFavorites } from "../favorites";

describe("sanitizeFavorites", () => {
  it("returns [] for any non-array input", () => {
    expect(sanitizeFavorites(null)).toEqual([]);
    expect(sanitizeFavorites(undefined)).toEqual([]);
    expect(sanitizeFavorites("nope")).toEqual([]);
    expect(sanitizeFavorites({ favorites: [] })).toEqual([]);
    expect(sanitizeFavorites(42)).toEqual([]);
  });

  it("coerces a favorite with a missing label to its path (the crash case)", () => {
    // This is EXACTLY the shape that took the app down: a legacy favorite with
    // no `label`. Before the fix, `f.label.toLowerCase()` threw here.
    const out = sanitizeFavorites([{ id: "a", type: "page", path: "/admin/content/sider-content/x" }]);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("/admin/content/sider-content/x");
    // The whole point: the sanitized output is always safe to lower-case.
    expect(() => out[0].label.toLowerCase()).not.toThrow();
  });

  it("guarantees every returned label + path is a string (no toLowerCase crash)", () => {
    const messy = [
      { path: "/admin/a" },                       // no label
      { label: 123, path: "/admin/b" },           // non-string label
      { id: "c", label: "Cee", path: "/admin/c" },// well-formed
    ];
    const out = sanitizeFavorites(messy);
    for (const f of out) {
      expect(typeof f.label).toBe("string");
      expect(typeof f.path).toBe("string");
      expect(() => `${f.label} ${f.path}`.toLowerCase()).not.toThrow();
    }
  });

  it("drops elements that are not usable (null, non-object, no path)", () => {
    const out = sanitizeFavorites([
      null,
      "string",
      42,
      { id: "no-path", label: "orphan" }, // no path → unusable
      { path: "/admin/keep", label: "Keep" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].path).toBe("/admin/keep");
  });

  it("coerces an unknown type to 'page' and preserves a valid one", () => {
    const out = sanitizeFavorites([
      { path: "/admin/x", type: "bogus" },
      { path: "/admin/y", type: "document" },
    ]);
    expect(out[0].type).toBe("page");
    expect(out[1].type).toBe("document");
  });

  it("passes a well-formed favorite through intact", () => {
    const fav = {
      id: "id-1",
      type: "document",
      label: "My Post",
      path: "/admin/content/blog/my-post",
      icon: "FileText",
      collection: "blog",
      slug: "my-post",
      addedAt: "2026-07-11T00:00:00.000Z",
    };
    const out = sanitizeFavorites([fav]);
    expect(out[0]).toEqual(fav);
  });
});
