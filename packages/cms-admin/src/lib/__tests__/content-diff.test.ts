/**
 * content-diff helper tests.
 * Covers diffTrees pure logic (no IO needed) + getCmsAdminContentTree
 * with a real tmpdir + fetchLiveContentTree with mocked fetch.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let tmpData = "";

vi.mock("../site-paths", () => ({
  getActiveSitePaths: async () => ({
    dataDir: tmpData,
    projectDir: tmpData,
    contentDir: path.join(tmpData, "content"),
    configPath: path.join(tmpData, "cms.config.ts"),
    uploadDir: path.join(tmpData, "uploads"),
    previewUrl: "",
  }),
  getActiveSiteEntry: async () => ({
    id: "test-site",
    name: "test-site.fly.dev",
    revalidateUrl: "https://test-site.fly.dev/api/revalidate",
    revalidateSecret: "deadbeef",
  }),
}));

import {
  getCmsAdminContentTree,
  fetchLiveContentTree,
  diffTrees,
  diffActiveSiteContent,
  type ContentTree,
} from "../content-diff";

beforeEach(() => {
  tmpData = mkdtempSync(path.join(tmpdir(), "content-diff-test-"));
});

afterEach(() => {
  if (tmpData && existsSync(tmpData)) rmSync(tmpData, { recursive: true, force: true });
});

function writeContentFile(rel: string, content: string = "{}"): void {
  const abs = path.join(tmpData, "content", rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

describe("getCmsAdminContentTree", () => {
  it("returns empty tree when contentDir does not exist", async () => {
    const result = await getCmsAdminContentTree();
    expect(result.tree).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("walks collections and lists json files", async () => {
    writeContentFile("pages/om.json");
    writeContentFile("pages/home.json");
    writeContentFile("products/widget.json");
    const result = await getCmsAdminContentTree();
    expect(result.total).toBe(3);
    const slugs = result.tree.map((e) => `${e.collection}/${e.slug}`).sort();
    expect(slugs).toEqual(["pages/home", "pages/om", "products/widget"]);
  });

  it("includes size + mtime metadata", async () => {
    writeContentFile("pages/om.json", '{"title":"Om"}');
    const result = await getCmsAdminContentTree();
    expect(result.tree[0]?.size).toBeGreaterThan(0);
    expect(result.tree[0]?.mtime).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("skips dot/underscore-prefixed files and directories", async () => {
    writeContentFile("pages/om.json");
    writeContentFile("pages/.hidden.json");
    writeContentFile("pages/_internal.json");
    writeContentFile("_revisions/something.json");
    writeContentFile(".cache/x.json");
    const result = await getCmsAdminContentTree();
    expect(result.total).toBe(1);
    expect(result.tree[0]?.slug).toBe("om");
  });

  it("ignores non-json files", async () => {
    writeContentFile("pages/om.json");
    writeContentFile("pages/readme.md");
    writeContentFile("pages/image.png", "fakebinary");
    const result = await getCmsAdminContentTree();
    expect(result.total).toBe(1);
  });
});

describe("fetchLiveContentTree", () => {
  it("calls live endpoint with HMAC signature", async () => {
    let observedHeaders: Headers | undefined;
    let observedUrl = "";
    const fetchImpl = vi.fn(async (url: any, init: any) => {
      observedUrl = typeof url === "string" ? url : url.toString();
      observedHeaders = new Headers(init.headers);
      return new Response(JSON.stringify({
        tree: [{ collection: "pages", slug: "live-only", size: 100 }],
        total: 1,
        generatedAt: "2026-05-06T00:00:00Z",
      }), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await fetchLiveContentTree({ fetchImpl });

    // URL derived from revalidateUrl
    expect(observedUrl).toBe("https://test-site.fly.dev/api/admin/content-tree");

    // HMAC header present
    const sig = observedHeaders?.get("x-cms-signature");
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);

    expect(result.total).toBe(1);
  });

  it("throws when live returns non-2xx", async () => {
    const fetchImpl = vi.fn(async () => new Response("forbidden", { status: 401 })) as unknown as typeof fetch;
    await expect(fetchLiveContentTree({ fetchImpl })).rejects.toThrow(/HTTP 401/);
  });

  it("throws when live response missing tree array", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ malformed: true }), { status: 200 })) as unknown as typeof fetch;
    await expect(fetchLiveContentTree({ fetchImpl })).rejects.toThrow(/missing 'tree'/);
  });
});

describe("diffTrees", () => {
  function tree(...entries: { c: string; s: string }[]): ContentTree {
    return {
      tree: entries.map(({ c, s }) => ({ collection: c, slug: s })),
      total: entries.length,
      generatedAt: "2026-05-06T00:00:00Z",
    };
  }

  it("reports identical trees as fully-overlapping", () => {
    const local = tree({ c: "pages", s: "om" }, { c: "pages", s: "home" });
    const live = tree({ c: "pages", s: "om" }, { c: "pages", s: "home" });
    const diff = diffTrees(local, live);
    expect(diff.inBoth).toBe(2);
    expect(diff.onlyInCms).toEqual([]);
    expect(diff.onlyInLive).toEqual([]);
    expect(diff.collectionsOnlyInCms).toEqual([]);
    expect(diff.collectionsOnlyInLive).toEqual([]);
  });

  it("reports cms-only entries", () => {
    const local = tree({ c: "pages", s: "om" }, { c: "school-modules", s: "intro" });
    const live = tree({ c: "pages", s: "om" });
    const diff = diffTrees(local, live);
    expect(diff.inBoth).toBe(1);
    expect(diff.onlyInCms.map((e) => e.slug)).toEqual(["intro"]);
    expect(diff.collectionsOnlyInCms).toEqual(["school-modules"]);
    expect(diff.collectionsOnlyInLive).toEqual([]);
  });

  it("reports live-only entries (the drift case)", () => {
    const local = tree({ c: "pages", s: "om" });
    const live = tree(
      { c: "pages", s: "om" },
      { c: "mail-skabeloner", s: "overrides" },
    );
    const diff = diffTrees(local, live);
    expect(diff.inBoth).toBe(1);
    expect(diff.onlyInLive.map((e) => e.slug)).toEqual(["overrides"]);
    expect(diff.collectionsOnlyInLive).toEqual(["mail-skabeloner"]);
  });

  it("handles totally-disjoint trees", () => {
    const local = tree({ c: "a", s: "x" });
    const live = tree({ c: "b", s: "y" });
    const diff = diffTrees(local, live);
    expect(diff.inBoth).toBe(0);
    expect(diff.collectionsOnlyInCms).toEqual(["a"]);
    expect(diff.collectionsOnlyInLive).toEqual(["b"]);
  });

  it("computes totals from input trees, not after-diff math", () => {
    const local = tree({ c: "a", s: "x" }, { c: "a", s: "y" });
    const live = tree({ c: "a", s: "x" });
    const diff = diffTrees(local, live);
    expect(diff.cmsTotal).toBe(2);
    expect(diff.liveTotal).toBe(1);
  });
});

describe("diffActiveSiteContent — integration", () => {
  it("composes local read + live fetch into a single diff result", async () => {
    writeContentFile("pages/om.json");
    writeContentFile("pages/home.json");
    writeContentFile("products/widget.json");

    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      tree: [
        { collection: "pages", slug: "om" },
        { collection: "mail-skabeloner", slug: "overrides" },
      ],
      total: 2,
      generatedAt: "2026-05-06T00:00:00Z",
    }), { status: 200 })) as unknown as typeof fetch;

    const diff = await diffActiveSiteContent({ fetchImpl });

    expect(diff.cmsTotal).toBe(3);
    expect(diff.liveTotal).toBe(2);
    expect(diff.inBoth).toBe(1);
    expect(diff.collectionsOnlyInCms.sort()).toEqual(["products"]);
    expect(diff.collectionsOnlyInLive).toEqual(["mail-skabeloner"]);
  });
});
