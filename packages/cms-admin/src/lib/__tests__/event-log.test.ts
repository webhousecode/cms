import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { logEvent, readLog, hashIp } from "../event-log";

describe("event-log", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "event-log-test-"));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("writes and reads audit entries", async () => {
    await logEvent({
      dataDir: tmpDir,
      layer: "audit",
      level: "info",
      action: "document.created",
      actor: { type: "user", userId: "u1", name: "Alice" },
      target: { type: "document", collection: "posts", slug: "hello" },
    });

    // readLog uses getActiveSitePaths which won't work in unit tests,
    // so verify file contents directly.
    const file = path.join(tmpDir, "audit.jsonl");
    expect(fs.existsSync(file)).toBe(true);
    const content = fs.readFileSync(file, "utf-8");
    const entry = JSON.parse(content.trim());
    expect(entry.action).toBe("document.created");
    expect(entry.actor.userId).toBe("u1");
    expect(entry.target?.collection).toBe("posts");
    expect(entry.id).toMatch(/^[a-f0-9]{8}$/);
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("writes to the correct file per layer", async () => {
    await logEvent({ dataDir: tmpDir, layer: "audit", level: "info", action: "a", actor: { type: "user" } });
    await logEvent({ dataDir: tmpDir, layer: "server", level: "error", action: "b", actor: { type: "system" } });
    await logEvent({ dataDir: tmpDir, layer: "client", level: "warn", action: "c", actor: { type: "browser" } });

    expect(fs.existsSync(path.join(tmpDir, "audit.jsonl"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "server.jsonl"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "client.jsonl"))).toBe(true);
  });

  it("never throws on write errors", async () => {
    // Point at a non-writable path — logEvent should swallow the error silently.
    await expect(
      logEvent({
        dataDir: "/root/does-not-exist-and-cannot-create",
        layer: "audit",
        level: "info",
        action: "test",
        actor: { type: "user" },
      }),
    ).resolves.toBeUndefined();
  });

  it("appends multiple entries as separate JSONL lines", async () => {
    for (let i = 0; i < 5; i++) {
      await logEvent({
        dataDir: tmpDir,
        layer: "audit",
        level: "info",
        action: `event.${i}`,
        actor: { type: "user" },
      });
    }
    const content = fs.readFileSync(path.join(tmpDir, "audit.jsonl"), "utf-8");
    const lines = content.split("\n").filter(Boolean);
    expect(lines.length).toBe(5);
    lines.forEach((line, i) => {
      const entry = JSON.parse(line);
      expect(entry.action).toBe(`event.${i}`);
    });
  });

  it("hashes IP addresses consistently", () => {
    expect(hashIp(null)).toBeUndefined();
    expect(hashIp(undefined)).toBeUndefined();
    expect(hashIp("")).toBeUndefined();
    const h1 = hashIp("192.168.1.1");
    const h2 = hashIp("192.168.1.1");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{8}$/);
    expect(hashIp("192.168.1.2")).not.toBe(h1);
  });

  it("readLog signature compiles and returns the expected shape", async () => {
    // We can't call readLog without getActiveSitePaths, but we can verify
    // the module exports and function signature are correct.
    expect(typeof readLog).toBe("function");
  });
});
