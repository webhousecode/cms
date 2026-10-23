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
  const job = yml.slice(yml.indexOf("\n  deploy:"));

  it("checks out full history (merge-base needs both commits)", () => {
    expect(job).toMatch(/fetch-depth:\s*0/);
  });

  it("runs the guard BEFORE flyctl deploy and gates the deploy on it", () => {
    const guardAt = job.indexOf("scripts/deploy-is-stale.sh");
    const deployAt = job.indexOf("flyctl deploy");
    expect(guardAt, "deploy.yml does not call scripts/deploy-is-stale.sh").toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(deployAt);
    expect(job.slice(guardAt, deployAt + 200)).toMatch(/if:\s*steps\.stale\.outputs\.skip\s*!=\s*'true'/);
  });
});
