/**
 * F144 P3 — Source-tar packager tests.
 *
 * Verifies:
 *   - excludes node_modules, .git, .next, dist, _data
 *   - includes top-level source files (build.ts, package.json, public/…)
 *   - merges optional contentDir under content/ at archive root
 *   - extraExcludes adds beyond the default exclusion list
 *   - returns a non-empty Buffer + stats
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import { packSourceTar } from "../build-orchestrator/source-tar";

let workDir = "";

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), "src-tar-test-"));
});

afterEach(() => {
  if (workDir && existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
});

function writeFile(rel: string, content = "x"): void {
  const abs = path.join(workDir, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

/**
 * Decode a gzipped tar to a flat list of entry paths. We parse just
 * enough of the USTAR header to extract names — no real tar lib needed.
 */
function listTarPaths(tarGz: Buffer): string[] {
  const tar = gunzipSync(tarGz);
  const paths: string[] = [];
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const block = tar.subarray(offset, offset + 512);
    // Empty block — end of archive
    if (block[0] === 0) break;
    const name = block.subarray(0, 100).toString("utf-8").replace(/\0+$/, "");
    const sizeOctal = block.subarray(124, 124 + 12).toString("utf-8").replace(/\0+$/, "").trim();
    const size = parseInt(sizeOctal, 8) || 0;
    if (name) paths.push(name);
    // header (512) + content rounded up to 512
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return paths;
}

describe("packSourceTar", () => {
  it("includes top-level source files + public/ tree", async () => {
    writeFile("build.ts", "export default {}");
    writeFile("package.json", "{}");
    writeFile("public/favicon.ico", "icon");
    writeFile("public/img/logo.png", "logo");

    const result = await packSourceTar({ projectDir: workDir });
    const paths = listTarPaths(result.tarGz);

    expect(paths).toContain("build.ts");
    expect(paths).toContain("package.json");
    expect(paths).toContain("public/favicon.ico");
    expect(paths).toContain("public/img/logo.png");
    expect(result.fileCount).toBe(4);
    expect(result.rawBytes).toBeGreaterThan(0);
  });

  it("excludes node_modules, .git, .next, dist, _data", async () => {
    writeFile("build.ts", "x");
    writeFile("node_modules/foo/index.js", "junk");
    writeFile(".git/HEAD", "ref");
    writeFile(".next/cache/blob", "cache");
    writeFile("dist/bundle.js", "out");
    writeFile("_data/secrets.json", "secret");

    const result = await packSourceTar({ projectDir: workDir });
    const paths = listTarPaths(result.tarGz);

    expect(paths).toContain("build.ts");
    expect(paths.some((p) => p.startsWith("node_modules/"))).toBe(false);
    expect(paths.some((p) => p.startsWith(".git/"))).toBe(false);
    expect(paths.some((p) => p.startsWith(".next/"))).toBe(false);
    expect(paths.some((p) => p.startsWith("dist/"))).toBe(false);
    expect(paths.some((p) => p.startsWith("_data/"))).toBe(false);
  });

  it("respects extraExcludes", async () => {
    writeFile("build.ts", "x");
    writeFile("scratch/tmp.bin", "junk");

    const result = await packSourceTar({
      projectDir: workDir,
      extraExcludes: ["scratch"],
    });
    const paths = listTarPaths(result.tarGz);

    expect(paths).toContain("build.ts");
    expect(paths.some((p) => p.startsWith("scratch/"))).toBe(false);
  });

  it("merges contentDir under content/ inside the tar", async () => {
    writeFile("build.ts", "x");
    const contentDir = mkdtempSync(path.join(tmpdir(), "src-tar-content-"));
    try {
      writeFileSync(path.join(contentDir, "post-1.json"), '{"title":"a"}');
      mkdirSync(path.join(contentDir, "team"), { recursive: true });
      writeFileSync(path.join(contentDir, "team", "alice.json"), '{"name":"a"}');

      const result = await packSourceTar({ projectDir: workDir, contentDir });
      const paths = listTarPaths(result.tarGz);

      expect(paths).toContain("build.ts");
      expect(paths).toContain("content/post-1.json");
      expect(paths).toContain("content/team/alice.json");
    } finally {
      rmSync(contentDir, { recursive: true, force: true });
    }
  });

  it("returns valid gzipped tar bytes (decodable)", async () => {
    writeFile("hello.txt", "world");
    const result = await packSourceTar({ projectDir: workDir });
    expect(result.tarGz.length).toBeGreaterThan(0);
    // gzip magic
    expect(result.tarGz[0]).toBe(0x1f);
    expect(result.tarGz[1]).toBe(0x8b);
    // gunzip + parse worked above
    const paths = listTarPaths(result.tarGz);
    expect(paths).toContain("hello.txt");
  });
});
