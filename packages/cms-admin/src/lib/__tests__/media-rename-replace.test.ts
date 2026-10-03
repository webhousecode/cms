/**
 * F206.7 — a rename can never silently overwrite or hide another file, and a
 * site can REPLACE a file under the same name on purpose.
 *
 * Incident 3 Oct 2026 (trail): trash svg/trail.svg, then rename
 * trail-oykp.svg → trail.svg. Trash is soft (file stays on disk, a
 * `status: trashed` meta entry hides it), so fs.rename overwrote the old file
 * and the trashed entry then hid the NEW one — /api/media stopped listing
 * trail.svg, and the old illustration was gone for good.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { FilesystemMediaAdapter } from "../media/filesystem";

let root: string;
let uploads: string;
let adapter: FilesystemMediaAdapter;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "media-rename-"));
  uploads = path.join(root, "uploads");
  mkdirSync(path.join(uploads, "svg"), { recursive: true });
  mkdirSync(path.join(root, "_data"), { recursive: true });
  writeFileSync(path.join(uploads, "svg", "trail.svg"), "OLD");
  writeFileSync(path.join(uploads, "svg", "trail-oykp.svg"), "NEW");
  adapter = new FilesystemMediaAdapter(uploads, path.join(root, "_data"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const listed = async () => (await adapter.listMedia()).filter((f) => f.folder === "svg").map((f) => f.name).sort();

describe("renameFile — never onto an existing name (F206.7)", () => {
  it("refuses when the target is an active file, and touches nothing", async () => {
    await expect(adapter.renameFile("svg", "trail-oykp.svg", "trail.svg")).rejects.toMatchObject({ code: "EEXIST" });
    expect(readFileSync(path.join(uploads, "svg", "trail.svg"), "utf-8")).toBe("OLD");
    expect(readFileSync(path.join(uploads, "svg", "trail-oykp.svg"), "utf-8")).toBe("NEW");
  });

  it("refuses when the target is in the trash — the 3 Oct incident", async () => {
    await adapter.trashFile("svg", "trail.svg");
    await expect(adapter.renameFile("svg", "trail-oykp.svg", "trail.svg")).rejects.toMatchObject({ code: "EEXIST" });
    expect(readFileSync(path.join(uploads, "svg", "trail.svg"), "utf-8")).toBe("OLD");
  });

  it("still renames to a free name", async () => {
    const r = await adapter.renameFile("svg", "trail-oykp.svg", "free.svg");
    expect(r.url).toBe("/uploads/svg/free.svg");
    expect(await listed()).toEqual(["free.svg", "trail.svg"]);
  });
});

describe("renameFile with replace: true (F206.7)", () => {
  it("replaces an active file: new content under the old name, listed once", async () => {
    await adapter.renameFile("svg", "trail-oykp.svg", "trail.svg", { replace: true });
    expect(readFileSync(path.join(uploads, "svg", "trail.svg"), "utf-8")).toBe("NEW");
    expect(existsSync(path.join(uploads, "svg", "trail-oykp.svg"))).toBe(false);
    expect(await listed()).toEqual(["trail.svg"]);
  });

  it("replaces a trashed file and the new one is visible — no hiding meta left behind", async () => {
    await adapter.trashFile("svg", "trail.svg");
    await adapter.renameFile("svg", "trail-oykp.svg", "trail.svg", { replace: true });
    expect(await listed()).toEqual(["trail.svg"]);
    expect((await adapter.listTrashed()).map((m) => m.key)).not.toContain("svg/trail.svg");
  });
});
