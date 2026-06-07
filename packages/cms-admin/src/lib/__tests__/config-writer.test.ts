/**
 * config-writer regression tests.
 *
 * Background: 2026-05-19 production incident — schema edits on
 * sanneandersen.dk silently dropped `locales: ['da', 'en']` and
 * `defaultLocale: 'da'` from cms.config.ts because the rewriter only
 * knew about a fixed subset of top-level fields. These tests pin the
 * preserve-everything contract so a future edit to buildConfigContent
 * can't reintroduce the bug.
 *
 * See CLAUDE.md "Rewriting cms.config.ts MUST Preserve ALL Top-Level
 * Fields" for the rule this enforces.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import type { CmsConfig } from "@webhouse/cms";
import type { CollectionDef } from "../config-writer";

// buildConfigContent isn't exported; round-trip via writeConfigCollections
// against an in-memory mock of node:fs.
const writtenFiles = new Map<string, string>();

vi.mock("node:fs", () => ({
  readFileSync: (path: string) => writtenFiles.get(path) ?? "",
  writeFileSync: (path: string, content: string) => {
    writtenFiles.set(path, content);
  },
}));

let writeConfigCollections: (
  configPath: string,
  config: CmsConfig,
  collections: CollectionDef[],
) => Promise<void>;
let replaceCollectionsArray: (source: string, collections: CollectionDef[]) => string;

beforeAll(async () => {
  const mod = await import("../config-writer");
  writeConfigCollections = mod.writeConfigCollections;
  replaceCollectionsArray = mod.replaceCollectionsArray;
});

const minimalConfig: CmsConfig = {
  collections: [],
} as unknown as CmsConfig;

const sampleCollection: CollectionDef = {
  name: "posts",
  label: "Blog Posts",
  fields: [{ name: "title", type: "text" }],
};

function seed(path: string, source: string) {
  writtenFiles.set(path, source);
}

function read(path: string): string {
  return writtenFiles.get(path) ?? "";
}

describe("buildConfigContent — top-level field preservation", () => {
  it("preserves inline locales array across schema rewrites", async () => {
    const path = "/tmp/test-locales.ts";
    seed(
      path,
      `import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  locales: ['da', 'en'],
  defaultLocale: 'da',
  collections: [],
});
`,
    );
    await writeConfigCollections(path, minimalConfig, [sampleCollection]);
    const out = read(path);
    expect(out).toContain("locales: ['da', 'en'],");
    expect(out).toContain("defaultLocale: 'da',");
    // sanity — the new collection is in there too
    expect(out).toContain('name: "posts"');
  });

  it("preserves localeStrategy", async () => {
    const path = "/tmp/test-localestrategy.ts";
    seed(
      path,
      `import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  localeStrategy: 'prefix-other',
  collections: [],
});
`,
    );
    await writeConfigCollections(path, minimalConfig, [sampleCollection]);
    expect(read(path)).toContain("localeStrategy: 'prefix-other',");
  });

  it("preserves all four locale/i18n fields together", async () => {
    const path = "/tmp/test-all.ts";
    seed(
      path,
      `import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  locales: ['da', 'en', 'de'],
  defaultLocale: 'da',
  localeStrategy: 'prefix-all',
  i18n: { fallback: 'en' },
  collections: [],
});
`,
    );
    await writeConfigCollections(path, minimalConfig, [sampleCollection]);
    const out = read(path);
    expect(out).toContain("locales: ['da', 'en', 'de'],");
    expect(out).toContain("defaultLocale: 'da',");
    expect(out).toContain("localeStrategy: 'prefix-all',");
    expect(out).toContain("i18n: { fallback: 'en' },");
  });

  it("emits no preserved-field lines when none are present (existing single-locale sites)", async () => {
    const path = "/tmp/test-none.ts";
    seed(
      path,
      `import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  collections: [],
});
`,
    );
    await writeConfigCollections(path, minimalConfig, [sampleCollection]);
    const out = read(path);
    expect(out).not.toContain("locales:");
    expect(out).not.toContain("defaultLocale:");
    // collections still serialised correctly
    expect(out).toContain('name: "posts"');
  });

  it("is idempotent — second rewrite produces identical content", async () => {
    const path = "/tmp/test-idempotent.ts";
    seed(
      path,
      `import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  locales: ['da', 'en'],
  defaultLocale: 'da',
  collections: [],
});
`,
    );
    await writeConfigCollections(path, minimalConfig, [sampleCollection]);
    const first = read(path);
    await writeConfigCollections(path, minimalConfig, [sampleCollection]);
    const second = read(path);
    expect(second).toBe(first);
  });
});

describe("replaceCollectionsArray — preserves everything outside collections", () => {
  // A realistic config exercising every previously-dropped construct.
  const FULL = `import { defineConfig, defineCollection, defineBlock } from '@webhouse/cms';

export default defineConfig({
  locales: ['da', 'en'],
  defaultLocale: 'da',
  blocks: [
    defineBlock({ name: "carousel", label: "Carousel", fields: [{ name: "images", type: "image-gallery" }] }),
  ],
  autolinks: [{ term: "X", href: "/x" }],
  myCustomTopLevel: { keep: "me" },
  collections: [
    defineCollection({
      name: "posts",
      label: "Posts",
      urlPrefix: "/blog",
      urlPattern: "/:category/:slug",
      previewable: true,
      fields: [
        { name: "title", type: "text", required: true },
        { name: "stats", type: "array", fields: [{ name: "value", type: "text" }] },
      ],
    }),
  ],
  forms: [
    { name: "contact", label: "Contact", fields: [{ name: "email", type: "email" }] },
  ],
  storage: { adapter: "filesystem", filesystem: { contentDir: "content" } },
});
`;

  it("preserves blocks, autolinks, forms, storage and a CUSTOM top-level field", () => {
    const out = replaceCollectionsArray(FULL, [
      { name: "posts", label: "Posts", urlPrefix: "/blog", urlPattern: "/:category/:slug", fields: [{ name: "title", type: "text" }] },
    ]);
    expect(out).toContain("locales: ['da', 'en'],");
    expect(out).toContain(`defineBlock({ name: "carousel"`);
    expect(out).toContain(`autolinks: [{ term: "X", href: "/x" }],`);
    expect(out).toContain(`myCustomTopLevel: { keep: "me" },`); // no allow-list — arbitrary fields survive
    expect(out).toContain(`forms: [`);
    expect(out).toContain(`name: "contact"`);
    expect(out).toContain(`storage: { adapter: "filesystem"`);
  });

  it("preserves urlPattern and nested array fields on the edited collection", () => {
    const out = replaceCollectionsArray(FULL, [
      {
        name: "posts",
        label: "Posts",
        urlPrefix: "/blog",
        urlPattern: "/:category/:slug",
        previewable: true,
        fields: [
          { name: "title", type: "text", required: true },
          { name: "stats", type: "array", fields: [{ name: "value", type: "text" }] },
        ],
      },
    ]);
    expect(out).toContain(`urlPattern: "/:category/:slug"`);
    expect(out).toContain(`previewable: true`);
    // nested field array survives (undefined labels are dropped, not emitted)
    expect(out).toContain(`{ name: "stats", type: "array", fields: [{ name: "value", type: "text" }] }`);
  });

  it("preserves all FieldConfig props (defaultValue, maxLength, options, features, ai)", () => {
    const out = replaceCollectionsArray(FULL, [
      {
        name: "posts",
        fields: [
          {
            name: "category",
            type: "select",
            label: "Category",
            required: true,
            defaultValue: "news",
            maxLength: 80,
            options: [{ label: "News", value: "news" }, { label: "Blog", value: "blog" }],
            features: ["bold", "italic"],
            ai: { hint: "pick one", tone: "formal" },
          } as unknown as CollectionDef["fields"][number],
        ],
      },
    ]);
    expect(out).toContain(`defaultValue: "news"`);
    expect(out).toContain(`maxLength: 80`);
    expect(out).toContain(`options: [{ label: "News", value: "news" }, { label: "Blog", value: "blog" }]`);
    expect(out).toContain(`features: ["bold", "italic"]`);
    expect(out).toContain(`ai: { hint: "pick one", tone: "formal" }`);
  });

  it("handles labels containing literal brackets without truncating the array", () => {
    const src = FULL.replace('label: "Posts",', 'label: "Posts [archive]",');
    const out = replaceCollectionsArray(src, [{ name: "posts", fields: [{ name: "title", type: "text" }] }]);
    // forms after collections must survive — proves bracket matching skipped "[archive]"
    expect(out).toContain(`forms: [`);
    expect(out).toContain(`storage: { adapter: "filesystem"`);
  });

  it("can empty the collections array (delete-all) without touching the rest", () => {
    const out = replaceCollectionsArray(FULL, []);
    expect(out).toContain("collections: []");
    expect(out).toContain(`forms: [`);
    expect(out).toContain("locales: ['da', 'en'],");
  });

  it("throws (does not corrupt) when collections array is absent", () => {
    expect(() => replaceCollectionsArray("export default defineConfig({});", [])).toThrow();
  });
});
