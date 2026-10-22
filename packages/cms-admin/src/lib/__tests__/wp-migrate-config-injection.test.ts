/**
 * Security W41 NY-K5 — the WordPress migration writes a cms.config.ts from
 * values the REMOTE site controls, and the server then loads it. A newline in
 * the site URL broke out of a comment; a quote in a label broke out of a
 * string. The generated file must keep every such value inert.
 */
import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { generateCmsConfig, type CollectionDef } from "../wp-migration/create-site";

function run(code: string): { pwned: boolean; config: unknown } {
  const body = code
    .replace(/^import .*$/m, "")
    .replace("export default defineConfig(", "result = defineConfig(");
  const ctx = { pwned: false, result: undefined as unknown, defineConfig: (c: unknown) => c, defineCollection: (c: unknown) => c };
  vm.runInNewContext(body, ctx);
  return { pwned: ctx.pwned, config: ctx.result };
}

const col = (label: string): CollectionDef => ({
  name: "posts", label, urlPrefix: "/blog", hasExcerpt: false, hasDate: false, hasFeaturedImage: false, hasTags: false, hasCategories: false,
});

describe("generateCmsConfig", () => {
  it("a newline in the WordPress URL stays in the comment", () => {
    const probe = { url: "https://x.example\npwned = true; //", theme: { name: "t" }, pageBuilder: "none" } as never;
    expect(run(generateCmsConfig([col("Posts")], probe)).pwned).toBe(false);
  });

  it("a quote in a collection label stays a string, and the label survives intact", () => {
    const evil = "Posts', pwned: (pwned = true), x: '";
    const probe = { url: "https://x.example", theme: { name: "t\n*/ pwned = true; /*" }, pageBuilder: "none" } as never;
    const out = run(generateCmsConfig([col(evil)], probe));
    expect(out.pwned).toBe(false);
    expect((out.config as { collections: { label: string }[] }).collections[0]!.label).toBe(evil);
  });
});
