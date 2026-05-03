/**
 * F143 P5 — version-pinning tests.
 *
 * The pure logic (passing through pre-versioned specs, falling back
 * gracefully on lookup failure, sanity-checking the version output)
 * is unit-testable. The actual `pnpm view` network call is mocked
 * via a stub binary that emits a known string.
 */
import { describe, it, expect } from "vitest";
import { writeFileSync, chmodSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { pinVersions } from "../build-server/version-pinning";

/**
 * Build a small shell-script "stub" that mimics `pnpm view <pkg> version`.
 * Returns the absolute path. Caller is responsible for cleanup.
 *
 * `responses` maps package name → stdout (or "" to simulate failure exit 1).
 */
function makeStubPnpm(responses: Record<string, string>): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pnpm-stub-"));
  const binPath = path.join(dir, "pnpm-stub");
  const cases = Object.entries(responses)
    .map(([name, ver]) => {
      if (ver === "") {
        return `  "${name}") exit 1 ;;`;
      }
      return `  "${name}") echo "${ver}" ;;`;
    })
    .join("\n");
  // $1 = "view", $2 = pkg, $3 = "version"
  const script = `#!/bin/sh
case "$2" in
${cases}
  *) exit 1 ;;
esac
`;
  writeFileSync(binPath, script);
  chmodSync(binPath, 0o755);
  return binPath;
}

describe("pinVersions — passthrough cases (no network)", () => {
  it("returns empty list for empty input", async () => {
    const result = await pinVersions([]);
    expect(result).toEqual([]);
  });

  it("passes through specs that already have a version", async () => {
    const stub = makeStubPnpm({}); // no lookups should happen
    try {
      const result = await pinVersions(
        ["lodash@4.17.21", "three@^0.158.0", "axios@latest"],
        { pnpmBin: stub },
      );
      expect(result).toEqual(["lodash@4.17.21", "three@^0.158.0", "axios@latest"]);
    } finally {
      rmSync(path.dirname(stub), { recursive: true, force: true });
    }
  });

  it("trims whitespace and skips empty entries", async () => {
    const stub = makeStubPnpm({});
    try {
      const result = await pinVersions(
        ["  lodash@1.0.0  ", "", "   "],
        { pnpmBin: stub },
      );
      expect(result).toEqual(["lodash@1.0.0"]);
    } finally {
      rmSync(path.dirname(stub), { recursive: true, force: true });
    }
  });

  it("preserves scoped packages with version specifiers", async () => {
    const stub = makeStubPnpm({});
    try {
      const result = await pinVersions(["@scope/pkg@1.2.3"], { pnpmBin: stub });
      expect(result).toEqual(["@scope/pkg@1.2.3"]);
    } finally {
      rmSync(path.dirname(stub), { recursive: true, force: true });
    }
  });
});

describe("pinVersions — version resolution via stubbed pnpm", () => {
  it("resolves an unversioned dep by appending @<version>", async () => {
    const stub = makeStubPnpm({ lodash: "4.17.21" });
    try {
      const result = await pinVersions(["lodash"], { pnpmBin: stub });
      expect(result).toEqual(["lodash@4.17.21"]);
    } finally {
      rmSync(path.dirname(stub), { recursive: true, force: true });
    }
  });

  it("resolves multiple unversioned deps in one call", async () => {
    const stub = makeStubPnpm({
      lodash: "4.17.21",
      axios: "1.7.2",
      three: "0.158.0",
    });
    try {
      const result = await pinVersions(["lodash", "axios", "three"], {
        pnpmBin: stub,
      });
      expect(result).toEqual([
        "lodash@4.17.21",
        "axios@1.7.2",
        "three@0.158.0",
      ]);
    } finally {
      rmSync(path.dirname(stub), { recursive: true, force: true });
    }
  });

  it("mixes pinned + unpinned in the same call", async () => {
    const stub = makeStubPnpm({ lodash: "4.17.21" });
    try {
      const result = await pinVersions(
        ["lodash", "three@^0.158.0"],
        { pnpmBin: stub },
      );
      expect(result).toEqual(["lodash@4.17.21", "three@^0.158.0"]);
    } finally {
      rmSync(path.dirname(stub), { recursive: true, force: true });
    }
  });

  it("handles scoped packages without version", async () => {
    const stub = makeStubPnpm({ "@scope/pkg": "2.1.3" });
    try {
      const result = await pinVersions(["@scope/pkg"], { pnpmBin: stub });
      expect(result).toEqual(["@scope/pkg@2.1.3"]);
    } finally {
      rmSync(path.dirname(stub), { recursive: true, force: true });
    }
  });
});

describe("pinVersions — failure handling", () => {
  it("falls back to bare name when lookup fails (non-blocking)", async () => {
    // Stub returns exit 1 for "missing-pkg" — pinVersions should leave
    // the entry as bare "missing-pkg" so the install can still proceed
    // (pnpm install latest by default, lockfile pins resolved version).
    const stub = makeStubPnpm({ "missing-pkg": "" });
    try {
      const result = await pinVersions(["missing-pkg"], { pnpmBin: stub });
      expect(result).toEqual(["missing-pkg"]);
    } finally {
      rmSync(path.dirname(stub), { recursive: true, force: true });
    }
  });

  it("falls back when stub emits non-semver output", async () => {
    const stub = makeStubPnpm({ "weird-pkg": "this is not a version" });
    try {
      const result = await pinVersions(["weird-pkg"], { pnpmBin: stub });
      expect(result).toEqual(["weird-pkg"]);
    } finally {
      rmSync(path.dirname(stub), { recursive: true, force: true });
    }
  });

  it("falls back when pnpm bin doesn't exist (spawn error)", async () => {
    const result = await pinVersions(["lodash"], {
      pnpmBin: "/definitely/does/not/exist/pnpm",
    });
    expect(result).toEqual(["lodash"]);
  });

  it("respects timeout and falls back rather than hanging", async () => {
    // Stub script that sleeps forever
    const dir = mkdtempSync(path.join(os.tmpdir(), "pnpm-hang-"));
    const stub = path.join(dir, "pnpm-hang");
    writeFileSync(stub, "#!/bin/sh\nsleep 60\n");
    chmodSync(stub, 0o755);
    try {
      const result = await pinVersions(["lodash"], {
        pnpmBin: stub,
        timeoutMs: 100,
      });
      expect(result).toEqual(["lodash"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
