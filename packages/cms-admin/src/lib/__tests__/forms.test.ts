/**
 * F30 — Form engine unit tests.
 *
 * Tests the FormService (submission CRUD, unread counts, CSV export)
 * and spam protection (honeypot, rate limiter) using a temp directory.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cms-forms-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("FormService", () => {
  async function svc() {
    const { FormService } = await import("../forms/service");
    return new FormService(tmpDir);
  }

  it("create stores a submission and returns it with status 'new'", async () => {
    const s = await svc();
    const sub = await s.create("contact", { name: "Alice", message: "Hi" }, { ipHash: "aabbccdd" });
    expect(sub.form).toBe("contact");
    expect(sub.status).toBe("new");
    expect(sub.data.name).toBe("Alice");
    expect(sub.id).toBeTruthy();

    // File exists on disk
    const file = path.join(tmpDir, "submissions", "contact", `${sub.id}.json`);
    const raw = JSON.parse(await fs.readFile(file, "utf-8"));
    expect(raw.data.message).toBe("Hi");
  });

  it("list returns submissions newest first", async () => {
    const s = await svc();
    const a = await s.create("contact", { name: "A" }, {});
    // Manually tweak createdAt to ensure ordering
    const aFile = path.join(tmpDir, "submissions", "contact", `${a.id}.json`);
    const aData = JSON.parse(await fs.readFile(aFile, "utf-8"));
    aData.createdAt = "2026-01-01T00:00:00.000Z";
    await fs.writeFile(aFile, JSON.stringify(aData));

    const b = await s.create("contact", { name: "B" }, {});
    const list = await s.list("contact");
    expect(list).toHaveLength(2);
    expect(list[0]!.data.name).toBe("B"); // newer first
  });

  it("list with status filter", async () => {
    const s = await svc();
    await s.create("contact", { name: "New" }, {});
    const sub2 = await s.create("contact", { name: "Read" }, {});
    await s.updateStatus("contact", sub2.id, "read");

    const newOnly = await s.list("contact", { status: "new" });
    expect(newOnly).toHaveLength(1);
    expect(newOnly[0]!.data.name).toBe("New");
  });

  it("get returns a single submission", async () => {
    const s = await svc();
    const sub = await s.create("contact", { x: 1 }, {});
    const got = await s.get("contact", sub.id);
    expect(got?.data.x).toBe(1);
  });

  it("get returns null for nonexistent id", async () => {
    const s = await svc();
    expect(await s.get("contact", "nope")).toBeNull();
  });

  it("updateStatus sets status + readAt", async () => {
    const s = await svc();
    const sub = await s.create("contact", {}, {});
    const updated = await s.updateStatus("contact", sub.id, "read");
    expect(updated.status).toBe("read");
    expect(updated.readAt).toBeTruthy();
  });

  it("delete removes the file", async () => {
    const s = await svc();
    const sub = await s.create("contact", {}, {});
    await s.delete("contact", sub.id);
    expect(await s.get("contact", sub.id)).toBeNull();
  });

  it("delete throws for nonexistent", async () => {
    const s = await svc();
    await expect(s.delete("contact", "nope")).rejects.toThrow();
  });

  it("unreadCounts returns counts per form", async () => {
    const s = await svc();
    await s.create("contact", {}, {});
    await s.create("contact", {}, {});
    await s.create("newsletter", {}, {});
    const sub = await s.create("newsletter", {}, {});
    await s.updateStatus("newsletter", sub.id, "read");

    const counts = await s.unreadCounts();
    expect(counts).toEqual({ contact: 2, newsletter: 1 });
  });

  it("exportCsv produces valid CSV with all data keys", async () => {
    const s = await svc();
    await s.create("contact", { name: "Alice", email: "a@b.com" }, {});
    await s.create("contact", { name: "Bob", phone: "123" }, {});
    const csv = await s.exportCsv("contact");
    const lines = csv.split("\n");
    expect(lines[0]).toContain("name");
    expect(lines[0]).toContain("email");
    expect(lines[0]).toContain("phone");
    expect(lines).toHaveLength(3); // header + 2 rows
  });

  it("list returns empty array for nonexistent form", async () => {
    const s = await svc();
    expect(await s.list("nonexistent")).toEqual([]);
  });
});

describe("spam protection", () => {
  it("honeypot detects filled hidden field", async () => {
    const { isHoneypotTriggered, HONEYPOT_FIELD } = await import("../forms/spam");
    expect(isHoneypotTriggered({ [HONEYPOT_FIELD]: "bot@spam.com", name: "Real" })).toBe(true);
    expect(isHoneypotTriggered({ [HONEYPOT_FIELD]: "", name: "Human" })).toBe(false);
    expect(isHoneypotTriggered({ name: "No field" })).toBe(false);
  });

  it("rate limiter blocks after threshold", async () => {
    const { isRateLimited, _resetRateLimiter } = await import("../forms/spam");
    _resetRateLimiter();
    const ip = "abcd1234";
    for (let i = 0; i < 5; i++) {
      expect(isRateLimited(ip, "contact", 5)).toBe(false);
    }
    // 6th request → blocked
    expect(isRateLimited(ip, "contact", 5)).toBe(true);
  });

  it("rate limiter is per-form", async () => {
    const { isRateLimited, _resetRateLimiter } = await import("../forms/spam");
    _resetRateLimiter();
    const ip = "abcd1234";
    for (let i = 0; i < 5; i++) isRateLimited(ip, "contact", 5);
    // Different form — should NOT be limited
    expect(isRateLimited(ip, "newsletter", 5)).toBe(false);
  });

  it("hashIp produces 8 hex chars", async () => {
    const { hashIp } = await import("../forms/spam");
    const h = hashIp("192.168.1.1");
    expect(h).toMatch(/^[a-f0-9]{8}$/);
  });
});
