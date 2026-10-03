/**
 * F206.7 — a media rename/delete can never reach outside the uploads folder.
 *
 * Found by the auto-review security pass: `folder` and `oldName` were never
 * checked, so `{folder:"../secret", oldName:"../uploads/evil.png",
 * newName:"registry.json", replace:true}` overwrote a file outside uploads.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { FilesystemMediaAdapter } from "@/lib/media/filesystem";
import { assertSafeMediaPath } from "@/lib/media/safe-path";

let adapter: FilesystemMediaAdapter;
vi.mock("@/lib/require-role", () => ({ denyViewers: async () => null }));
vi.mock("@/lib/media", () => ({ getMediaAdapter: async () => adapter }));

import { POST as rename } from "@/app/api/media/rename/route";
import { DELETE as del } from "@/app/api/media/[...path]/route";

let root = "";
let uploads = "";
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "f2067-"));
  uploads = path.join(root, "uploads");
  mkdirSync(path.join(uploads, "blog"), { recursive: true });
  mkdirSync(path.join(root, "secret"));
  writeFileSync(path.join(root, "secret", "registry.json"), "ORIGINAL");
  writeFileSync(path.join(uploads, "evil.png"), "EVIL");
  writeFileSync(path.join(uploads, "blog", "a.png"), "A");
  adapter = new FilesystemMediaAdapter(uploads, path.join(root, "_data"));
});

const req = (body: unknown) => ({ json: async () => body }) as never;
const secret = () => readFileSync(path.join(root, "secret", "registry.json"), "utf-8");

describe("rename", () => {
  it("refuses a folder that climbs out, and the outside file is untouched", async () => {
    const r = await rename(req({ folder: "../secret", oldName: "../uploads/evil.png", newName: "registry.json", replace: true }));
    expect(r.status).toBe(400);
    expect(secret()).toBe("ORIGINAL");
  });

  it("refuses an oldName that climbs out", async () => {
    const r = await rename(req({ folder: "", oldName: "../secret/registry.json", newName: "stolen.json" }));
    expect(r.status).toBe(400);
    expect(secret()).toBe("ORIGINAL");
    expect(existsSync(path.join(uploads, "stolen.json"))).toBe(false);
  });

  it("still renames inside a nested folder — the guard is not 'always refuse'", async () => {
    const r = await rename(req({ folder: "blog", oldName: "a.png", newName: "b.png" }));
    expect(r.status).toBe(200);
    expect(existsSync(path.join(uploads, "blog", "b.png"))).toBe(true);
  });
});

describe("permanent delete", () => {
  it("refuses a path that climbs out, and the outside file survives", async () => {
    const r = await del(
      { nextUrl: new URL("http://x/api/media/x?permanent=true") } as never,
      { params: Promise.resolve({ path: ["..", "secret", "registry.json"] }) },
    );
    expect(r.status).toBe(400);
    expect(secret()).toBe("ORIGINAL");
  });
});

describe("assertSafeMediaPath", () => {
  it.each([
    ["..", "x"], ["a/../..", "x"], ["/etc", "x"], ["a\\b", "x"], ["a\0", "x"],
    ["", ".."], ["", "a/b"], ["", ""], ["", "x\0"],
  ])("refuses folder=%j name=%j", (folder, name) => {
    expect(() => assertSafeMediaPath(folder, name)).toThrow(/Invalid media path/);
  });

  it.each([["", "a.png"], ["blog", "a.png"], ["blog/2026", "a-b_c.webp"]])("allows folder=%j name=%j", (folder, name) => {
    expect(() => assertSafeMediaPath(folder, name)).not.toThrow();
  });
});
