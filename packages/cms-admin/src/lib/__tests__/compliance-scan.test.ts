/**
 * F201.1 — the compliance scanner must never report an unread repo as clean.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { scanProject, scanDir } from "../../../../../scripts/compliance-scan";

function repoWith(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "cscan-"));
  for (const [f, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    writeFileSync(path.join(dir, f), body);
  }
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["add", "-A"], { cwd: dir });
  return dir;
}

describe("compliance scan", () => {
  it("reports a repo it cannot read as NOT SCANNED, never as zero vendors", () => {
    const cache = mkdtempSync(path.join(tmpdir(), "cscan-cache-"));
    const { result, scan } = scanProject({ slug: "ghost", repo: "broberg-ai/this-repo-does-not-exist-f201" }, cache);
    expect(result.status).toBe("not_scanned");
    expect(result.reason).toMatch(/kunne ikke klones/);
    expect(scan).toBeNull();
  });

  it("reports a project without a repo as NOT SCANNED", () => {
    expect(scanProject({ slug: "x", repo: null }).result.status).toBe("not_scanned");
  });

  it("finds vendors by dependency, env-var name and host — with file:line", () => {
    const dir = repoWith({
      "package.json": JSON.stringify({ dependencies: { stripe: "1.0.0" } }, null, 2),
      "src/mail.ts": 'const k = process.env.RESEND_API_KEY;\nfetch("https://api.mistral.ai/v1/chat");\n',
      "fly.toml": 'app = "demo"\nprimary_region = "arn"\n',
    });
    const r = scanDir("t/demo", dir);
    expect([...r.hits.keys()].sort()).toEqual(["fly", "mistral", "resend", "stripe"]);
    expect(r.hits.get("resend")![0]).toMatchObject({ file: "src/mail.ts", line: 1 });
    expect(r.flyRegions).toEqual([{ app: "demo", region: "arn", file: "fly.toml" }]);
  });

  it("does not count tests, docs or fleet hooks as use", () => {
    const dir = repoWith({
      "src/a.test.ts": "process.env.STRIPE_SECRET_KEY",
      "docs/x.ts": "process.env.STRIPE_SECRET_KEY",
      ".claude/hooks/h.sh": "FLY_API_TOKEN",
    });
    expect(scanDir("t/x", dir).hits.size).toBe(0);
  });

  it("lists an unknown outbound host for review instead of dropping it", () => {
    const dir = repoWith({ "src/a.ts": 'fetch("https://api.somenewvendor.io/v2")' });
    expect([...scanDir("t/x", dir).unknownHosts.keys()]).toEqual(["api.somenewvendor.io"]);
  });
});
