import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A late, OLD deploy must never replace newer live code.
 *
 * 23 Oct 2026: three pushes minutes apart; the oldest run's test gate finished
 * last and its deploy rolled webhouse.app back (cms.fysio.work fell back to
 * English). The concurrency group only cancels deploys running at the same
 * moment. scripts/deploy-is-stale.sh decides; deploy.yml must call it before
 * flyctl deploy and skip on "stale".
 */

const ROOT = join(process.cwd(), "../..");
const SCRIPT = join(ROOT, "scripts/deploy-is-stale.sh");

let repo = "";
const shas: Record<string, string> = {};

function git(...args: string[]) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}
function guard(candidate: string, live: string) {
  const r = spawnSync("bash", [SCRIPT, candidate, live], { cwd: repo, encoding: "utf8" });
  return { out: r.stdout.trim(), code: r.status };
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "stale-guard-"));
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  for (const name of ["old", "mid", "new"]) {
    writeFileSync(join(repo, "f"), name);
    git("add", "f");
    git("commit", "-q", "-m", name);
    shas[name] = git("rev-parse", "HEAD");
  }
});

describe("deploy-is-stale.sh", () => {
  it("an older commit than the live one is stale — skip the deploy", () => {
    expect(guard(shas.old!, shas.new!)).toEqual({ out: "stale", code: 0 });
    expect(guard(shas.mid!, shas.new!)).toEqual({ out: "stale", code: 0 });
  });

  it("CONTROL: a newer commit deploys", () => {
    expect(guard(shas.new!, shas.old!)).toEqual({ out: "deploy", code: 1 });
  });

  it("redeploying the live commit itself still deploys (manual re-run)", () => {
    expect(guard(shas.new!, shas.new!)).toEqual({ out: "deploy", code: 1 });
  });

  it("fails open when the live sha is unknown or empty", () => {
    expect(guard(shas.old!, "0".repeat(40))).toEqual({ out: "deploy", code: 1 });
    expect(guard(shas.old!, "")).toEqual({ out: "deploy", code: 1 });
  });
});

describe("deploy.yml wires the guard", () => {
  const yml = readFileSync(join(ROOT, ".github/workflows/deploy.yml"), "utf8");
  // The guard is its own job; the deploy itself is the fleet-shared
  // fly-server-deploy workflow (owner 27/11 2026), which cms cannot edit —
  // so the gate lives on the calling job.
  const stale = yml.slice(yml.indexOf("\n  stale:"), yml.indexOf("\n  deploy:"));
  const deploy = yml.slice(yml.indexOf("\n  deploy:"));

  it("checks out full history (merge-base needs both commits)", () => {
    expect(yml.indexOf("\n  stale:"), "deploy.yml has no stale job").toBeGreaterThan(-1);
    expect(stale).toMatch(/fetch-depth:\s*0/);
  });

  it("the stale job runs the guard and exposes its verdict", () => {
    expect(stale.indexOf("scripts/deploy-is-stale.sh"), "deploy.yml does not call scripts/deploy-is-stale.sh").toBeGreaterThan(-1);
    expect(stale).toMatch(/skip:\s*\$\{\{\s*steps\.stale\.outputs\.skip\s*\}\}/);
  });

  it("the deploy job waits for the guard and is skipped on stale", () => {
    expect(deploy).toMatch(/needs:\s*\[?\s*stale\s*\]?/);
    expect(deploy).toMatch(/if:\s*needs\.stale\.outputs\.skip\s*!=\s*'true'/);
    expect(deploy).toMatch(/uses:\s*broberg-ai\/components\/\.github\/workflows\/fly-server-deploy\.yml@/);
  });
});
