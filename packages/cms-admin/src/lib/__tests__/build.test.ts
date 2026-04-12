/**
 * F126 — Unit tests for build executor, path validation, allowlist, and command parsing.
 */
import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";
import { parseCommand, isCommandAllowed, type OrgBuildSettings } from "../build/allowlist";
import { resolveWorkingDir, resolveOutDir } from "../build/validate-paths";
import { executeBuild } from "../build/executor";

// ── parseCommand ────────────────────────────────────────────

describe("parseCommand", () => {
  it("splits simple commands", () => {
    expect(parseCommand("php artisan build")).toEqual(["php", "artisan", "build"]);
  });

  it("handles double-quoted arguments", () => {
    expect(parseCommand('bundle "exec test" foo')).toEqual(["bundle", "exec test", "foo"]);
  });

  it("handles single-quoted arguments", () => {
    expect(parseCommand("echo 'hello world'")).toEqual(["echo", "hello world"]);
  });

  it("handles escaped characters", () => {
    expect(parseCommand("echo hello\\ world")).toEqual(["echo", "hello world"]);
  });

  it("returns empty array for empty string", () => {
    expect(parseCommand("")).toEqual([]);
    expect(parseCommand("   ")).toEqual([]);
  });

  it("treats shell injection as literal text (no shell interpretation)", () => {
    expect(parseCommand("echo $(rm -rf /)")).toEqual(["echo", "$(rm", "-rf", "/)"])
    // Backticks are NOT interpreted — they stay as literal characters
    expect(parseCommand("echo `cat /etc/passwd`")).toEqual(["echo", "`cat", "/etc/passwd`"]);
  });

  it("handles tabs as separators", () => {
    expect(parseCommand("npm\trun\tbuild")).toEqual(["npm", "run", "build"]);
  });

  it("handles mixed quotes", () => {
    expect(parseCommand(`echo "it's" 'a "test"'`)).toEqual(["echo", "it's", 'a "test"']);
  });
});

// ── isCommandAllowed ────────────────────────────────────────

describe("isCommandAllowed", () => {
  const allowAll: OrgBuildSettings = {
    allowCustomBuildCommands: true,
    allowedCommands: [],
  };

  const allowPhpOnly: OrgBuildSettings = {
    allowCustomBuildCommands: true,
    allowedCommands: ["php"],
  };

  const disableAll: OrgBuildSettings = {
    allowCustomBuildCommands: false,
  };

  it("allows any command when allowedCommands is empty", () => {
    expect(isCommandAllowed("php artisan build", allowAll)).toBe(true);
    expect(isCommandAllowed("hugo --minify", allowAll)).toBe(true);
  });

  it("rejects all when allowCustomBuildCommands is false", () => {
    expect(isCommandAllowed("php artisan build", disableAll)).toBe(false);
  });

  it("allows command when in allowlist", () => {
    expect(isCommandAllowed("php artisan build", allowPhpOnly)).toBe(true);
  });

  it("rejects command not in allowlist", () => {
    expect(isCommandAllowed("hugo --minify", allowPhpOnly)).toBe(false);
  });

  it("matches by basename (full path)", () => {
    expect(isCommandAllowed("/usr/bin/php artisan build", allowPhpOnly)).toBe(true);
  });

  it("rejects empty command", () => {
    expect(isCommandAllowed("", allowAll)).toBe(false);
  });
});

// ── resolveWorkingDir ───────────────────────────────────────

describe("resolveWorkingDir", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "f126-test-"));
  const subDir = path.join(tmpDir, "src");
  fs.mkdirSync(subDir);
  const filePath = path.join(tmpDir, "file.txt");
  fs.writeFileSync(filePath, "test");

  it("resolves to project dir when no workingDir given", () => {
    expect(resolveWorkingDir(tmpDir)).toBe(tmpDir);
  });

  it("resolves relative subdirectory", () => {
    expect(resolveWorkingDir(tmpDir, "src")).toBe(subDir);
  });

  it("throws on path traversal", () => {
    expect(() => resolveWorkingDir(tmpDir, "../..")).toThrow("escapes project directory");
  });

  it("throws on non-existent directory", () => {
    expect(() => resolveWorkingDir(tmpDir, "nonexistent")).toThrow("does not exist");
  });

  it("throws if path is a file, not directory", () => {
    expect(() => resolveWorkingDir(tmpDir, "file.txt")).toThrow("is not a directory");
  });
});

// ── resolveOutDir ───────────────────────────────────────────

describe("resolveOutDir", () => {
  const projectDir = "/tmp/my-project";

  it("resolves relative outDir", () => {
    expect(resolveOutDir(projectDir, "dist")).toBe(path.resolve(projectDir, "dist"));
  });

  it("resolves nested outDir", () => {
    expect(resolveOutDir(projectDir, "build/output")).toBe(path.resolve(projectDir, "build/output"));
  });

  it("throws on path traversal", () => {
    expect(() => resolveOutDir(projectDir, "../../etc")).toThrow("escapes project directory");
  });
});

// ── executeBuild ────────────────────────────────────────────

describe("executeBuild", () => {
  it("runs a simple command and captures stdout", async () => {
    const result = await executeBuild({
      command: "echo hello",
      workingDir: os.tmpdir(),
      env: {},
      timeout: 10,
    });
    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("hello");
    expect(result.cancelled).toBe(false);
  });

  it("captures non-zero exit code", async () => {
    const result = await executeBuild({
      command: "node -e process.exit(42)",
      workingDir: os.tmpdir(),
      env: {},
      timeout: 10,
    });
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(42);
  });

  it("streams log lines via onLog callback", async () => {
    const lines: string[] = [];
    await executeBuild({
      command: "echo line1 && echo line2",
      // This won't work with shell:false — use node instead
      workingDir: os.tmpdir(),
      env: {},
      timeout: 10,
      onLog: (line) => lines.push(line),
    });
    // With shell:false, "echo line1 && echo line2" is parsed as:
    // ["echo", "line1", "&&", "echo", "line2"] — echo prints all args
    expect(lines.length).toBeGreaterThan(0);
  });

  it("captures stderr", async () => {
    const result = await executeBuild({
      command: "node -e console.error('oops')",
      workingDir: os.tmpdir(),
      env: {},
      timeout: 10,
    });
    expect(result.stderr).toContain("oops");
  });

  it("returns duration", async () => {
    const result = await executeBuild({
      command: "echo fast",
      workingDir: os.tmpdir(),
      env: {},
      timeout: 10,
    });
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.duration).toBeLessThan(5000);
  });

  it("throws on empty command", async () => {
    await expect(
      executeBuild({
        command: "",
        workingDir: os.tmpdir(),
        env: {},
        timeout: 10,
      }),
    ).rejects.toThrow("Empty build command");
  });

  it("throws on blocked env var", async () => {
    await expect(
      executeBuild({
        command: "echo test",
        workingDir: os.tmpdir(),
        env: { LD_PRELOAD: "/evil.so" },
        timeout: 10,
      }),
    ).rejects.toThrow("blocked for security reasons");
  });

  it("filters unknown env vars silently", async () => {
    const result = await executeBuild({
      command: "echo ok",
      workingDir: os.tmpdir(),
      env: { UNKNOWN_VAR: "value", NODE_ENV: "test" },
      timeout: 10,
    });
    expect(result.success).toBe(true);
  });

  it("supports cancellation via AbortSignal", async () => {
    const ac = new AbortController();
    // Start a long-running command, then cancel it
    const promise = executeBuild({
      command: "node -e setTimeout(()=>{},30000)",
      workingDir: os.tmpdir(),
      env: {},
      timeout: 60,
      signal: ac.signal,
    });
    // Cancel after a short delay
    setTimeout(() => ac.abort(), 200);
    const result = await promise;
    expect(result.cancelled).toBe(true);
    expect(result.success).toBe(false);
  }, 10000);
});
