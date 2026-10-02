import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { enrichDist } from "../enrich/index";

const FIXTURE = path.join(__dirname, "fixtures", "enrich");

function readTree(dir: string, base = dir, out: Record<string, string> = {}): Record<string, string> {
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) readTree(full, base, out);
    else out[path.relative(base, full)] = readFileSync(full, "utf-8");
  }
  return out;
}

describe("enrichDist", () => {
  let work: string;

  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
    work = mkdtempSync(path.join(tmpdir(), "enrich-"));
    cpSync(FIXTURE, work, { recursive: true });
  });

  afterAll(() => {
    vi.useRealTimers();
    rmSync(work, { recursive: true, force: true });
  });

  it("produces the same enriched output as before the move to @webhouse/cms", async () => {
    await enrichDist(path.join(work, "dist"), path.join(work, "project", "content"), {
      baseUrl: "https://fixture.example",
      basePath: "",
      siteName: "Fixture Site",
      siteDescription: "A fixture for enrichDist",
      siteImage: "/images/default-og.jpg",
      themeColor: "#F7BB2E",
      lang: "en",
    });
    expect(readTree(path.join(work, "dist"))).toMatchSnapshot();
  });
});
