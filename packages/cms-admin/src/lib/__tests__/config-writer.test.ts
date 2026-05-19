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

beforeAll(async () => {
  writeConfigCollections = (await import("../config-writer")).writeConfigCollections;
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
