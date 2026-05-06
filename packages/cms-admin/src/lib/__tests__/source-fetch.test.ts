/**
 * F144 P3 completion — source-fetch tests.
 *
 * Covers parseSourceUrl exhaustively (pure function, no IO) plus the
 * two fetchSource branches (local passthrough, github clone). The
 * github tests inject a gitRunner so we never hit the network or the
 * real git binary in unit tests.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  fetchSource,
  parseSourceUrl,
  SourceParseError,
  type GitRunner,
} from "../build-orchestrator/source-fetch";

describe("parseSourceUrl", () => {
  it("parses simple github URL", () => {
    expect(parseSourceUrl("github:foo/bar")).toEqual({
      kind: "github", owner: "foo", repo: "bar",
    });
  });

  it("parses github URL with subdir", () => {
    expect(parseSourceUrl("github:foo/bar:apps/site")).toEqual({
      kind: "github", owner: "foo", repo: "bar", subdir: "apps/site",
    });
  });

  it("parses github URL with hyphens and dots in name", () => {
    expect(parseSourceUrl("github:web-house.co/my.site-repo")).toEqual({
      kind: "github", owner: "web-house.co", repo: "my.site-repo",
    });
  });

  it("parses local URL with absolute path", () => {
    expect(parseSourceUrl("local:/var/data/source")).toEqual({
      kind: "local", path: "/var/data/source",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(parseSourceUrl("  github:foo/bar  ")).toEqual({
      kind: "github", owner: "foo", repo: "bar",
    });
  });

  it("rejects relative local path", () => {
    expect(() => parseSourceUrl("local:relative/path")).toThrow(SourceParseError);
  });

  it("rejects empty source", () => {
    expect(() => parseSourceUrl("")).toThrow(SourceParseError);
  });

  it("rejects unknown protocol (https://)", () => {
    expect(() => parseSourceUrl("https://github.com/foo/bar")).toThrow(SourceParseError);
  });

  it("rejects github URL missing repo", () => {
    expect(() => parseSourceUrl("github:foo")).toThrow(SourceParseError);
  });
});

describe("fetchSource — local mode", () => {
  let tmp = "";
  beforeEach(() => { tmp = mkdtempSync(path.join(tmpdir(), "fs-local-test-")); });
  afterEach(() => { if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true }); });

  it("returns the local path as-is when it exists", async () => {
    writeFileSync(path.join(tmp, "package.json"), "{}");
    const result = await fetchSource({ source: `local:${tmp}` });
    expect(result.dir).toBe(tmp);
    expect(result.ref.branch).toBe("main");
    expect(result.ref.sha).toBeUndefined();
  });

  it("cleanup is a no-op for local mode (preserves the source)", async () => {
    writeFileSync(path.join(tmp, "marker"), "x");
    const result = await fetchSource({ source: `local:${tmp}` });
    result.cleanup();
    expect(existsSync(path.join(tmp, "marker"))).toBe(true);
  });

  it("throws if local path does not exist", async () => {
    await expect(
      fetchSource({ source: `local:${tmp}/does-not-exist` }),
    ).rejects.toThrow(/does not exist/);
  });
});

describe("fetchSource — github mode (mocked git)", () => {
  let tmpBase = "";
  beforeEach(() => { tmpBase = mkdtempSync(path.join(tmpdir(), "fs-gh-test-")); });
  afterEach(() => { if (existsSync(tmpBase)) rmSync(tmpBase, { recursive: true, force: true }); });

  function fakeClone(target: string, files: Record<string, string> = { "package.json": "{}" }): void {
    mkdirSync(target, { recursive: true });
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(target, rel);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, content);
    }
  }

  it("clones with --depth=1 and returns the clone dir + sha", async () => {
    let clonedTo = "";
    const gitRunner: GitRunner = (args) => {
      if (args[0] === "clone") {
        clonedTo = args[args.length - 1]!;
        fakeClone(clonedTo);
        return "";
      }
      if (args[0] === "rev-parse") return "abc123def456\n";
      return "";
    };

    const result = await fetchSource({
      source: "github:foo/bar",
      tmpBase,
      gitRunner,
    });

    expect(result.dir).toBe(clonedTo);
    expect(result.ref.branch).toBe("main");
    expect(result.ref.sha).toBe("abc123def456");
    expect(existsSync(path.join(result.dir, "package.json"))).toBe(true);

    result.cleanup();
    expect(existsSync(result.dir)).toBe(false);
  });

  it("passes --depth=1 + --branch arguments correctly", async () => {
    let observedArgs: string[] = [];
    const gitRunner: GitRunner = (args) => {
      if (args[0] === "clone") {
        observedArgs = args;
        fakeClone(args[args.length - 1]!);
      }
      return "";
    };

    await fetchSource({
      source: "github:foo/bar",
      branch: "develop",
      tmpBase,
      gitRunner,
    });

    expect(observedArgs).toContain("--depth=1");
    expect(observedArgs).toContain("--branch");
    expect(observedArgs[observedArgs.indexOf("--branch") + 1]).toBe("develop");
  });

  it("defaults branch to main when omitted", async () => {
    let observedBranch = "";
    const gitRunner: GitRunner = (args) => {
      if (args[0] === "clone") {
        observedBranch = args[args.indexOf("--branch") + 1]!;
        fakeClone(args[args.length - 1]!);
      }
      return "";
    };

    await fetchSource({ source: "github:foo/bar", tmpBase, gitRunner });
    expect(observedBranch).toBe("main");
  });

  it("includes token in clone URL when provided", async () => {
    let cloneUrl = "";
    const gitRunner: GitRunner = (args) => {
      if (args[0] === "clone") {
        cloneUrl = args[args.length - 2]!;
        fakeClone(args[args.length - 1]!);
      }
      return "";
    };

    await fetchSource({
      source: "github:foo/bar",
      token: "ghp_secret123",
      tmpBase,
      gitRunner,
    });

    expect(cloneUrl).toContain("x-access-token:ghp_secret123@github.com");
  });

  it("omits token from clone URL when not provided", async () => {
    let cloneUrl = "";
    const gitRunner: GitRunner = (args) => {
      if (args[0] === "clone") {
        cloneUrl = args[args.length - 2]!;
        fakeClone(args[args.length - 1]!);
      }
      return "";
    };

    await fetchSource({ source: "github:foo/bar", tmpBase, gitRunner });

    expect(cloneUrl).not.toContain("x-access-token");
    expect(cloneUrl).toBe("https://github.com/foo/bar.git");
  });

  it("returns subdir when specified", async () => {
    const gitRunner: GitRunner = (args) => {
      if (args[0] === "clone") {
        fakeClone(args[args.length - 1]!, {
          "apps/site/next.config.ts": "export default {};",
          "apps/site/package.json": "{}",
        });
      }
      return "";
    };

    const result = await fetchSource({
      source: "github:foo/bar:apps/site",
      tmpBase,
      gitRunner,
    });

    expect(result.dir.endsWith(path.join("apps", "site"))).toBe(true);
    expect(existsSync(path.join(result.dir, "next.config.ts"))).toBe(true);
  });

  it("throws and cleans up if subdir does not exist in clone", async () => {
    let cloneDir = "";
    const gitRunner: GitRunner = (args) => {
      if (args[0] === "clone") {
        cloneDir = args[args.length - 1]!;
        fakeClone(cloneDir);
      }
      return "";
    };

    await expect(fetchSource({
      source: "github:foo/bar:apps/missing",
      tmpBase,
      gitRunner,
    })).rejects.toThrow(/subdir not found/);

    expect(existsSync(cloneDir)).toBe(false);
  });

  it("cleans up tmp dir on git failure", async () => {
    let cloneDir = "";
    const gitRunner: GitRunner = (args) => {
      if (args[0] === "clone") {
        cloneDir = args[args.length - 1]!;
        mkdirSync(cloneDir, { recursive: true });
        throw new Error("git: simulated network failure");
      }
      return "";
    };

    await expect(fetchSource({
      source: "github:foo/bar",
      tmpBase,
      gitRunner,
    })).rejects.toThrow(/network failure/);

    expect(existsSync(cloneDir)).toBe(false);
  });

  it("cleanup is idempotent — calling twice does not throw", async () => {
    const gitRunner: GitRunner = (args) => {
      if (args[0] === "clone") fakeClone(args[args.length - 1]!);
      return "";
    };

    const result = await fetchSource({ source: "github:foo/bar", tmpBase, gitRunner });
    result.cleanup();
    expect(() => result.cleanup()).not.toThrow();
  });

  it("survives missing rev-parse without losing the clone", async () => {
    const gitRunner: GitRunner = (args) => {
      if (args[0] === "clone") {
        fakeClone(args[args.length - 1]!);
        return "";
      }
      if (args[0] === "rev-parse") {
        throw new Error("not a git repo");
      }
      return "";
    };

    const result = await fetchSource({ source: "github:foo/bar", tmpBase, gitRunner });
    expect(result.ref.sha).toBeUndefined();
    expect(existsSync(result.dir)).toBe(true);
    result.cleanup();
  });
});
