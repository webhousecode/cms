/**
 * Security W41 H6 — the 30-day inline-edit token (it lives on the customer's
 * public site) passed as a FULL session when sent as a cookie, and its Bearer
 * allowlist matched non-document routes under /api/cms/*.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { isAllowedForEditSession, NON_COLLECTION_API_CMS } from "../../proxy";

const SECRET = "y".repeat(64);
beforeAll(() => { process.env.CMS_JWT_SECRET = SECRET; });

async function editToken() {
  return new SignJWT({ sub: "u", email: "e@x", name: "E", role: "admin", editSession: true, site: "sanneandersen" })
    .setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));
}

describe("editSession allowlist — only documents", () => {
  it("refuses every non-collection directory under /api/cms", () => {
    for (const dir of ["registry/export-schema", "curation/abc", "chat/export", "chat/memory"]) {
      expect(isAllowedForEditSession(`/api/cms/${dir}`, "GET", "sanneandersen", "sanneandersen"), dir).toBe(false);
    }
    expect(isAllowedForEditSession("/api/cms/pages/home", "PATCH", "sanneandersen", "sanneandersen")).toBe(true);
  });

  it("the deny list matches the real directory listing (a new /api/cms dir cannot be forgotten)", () => {
    const dirs = readdirSync(path.join(__dirname, "../../app/api/cms"), { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== "[collection]").map((d) => d.name).sort();
    expect([...NON_COLLECTION_API_CMS].sort()).toEqual(dirs);
  });
});

describe("editSession token as a COOKIE", () => {
  it("cannot open the admin or a non-document API", async () => {
    const { proxy } = await import("../../proxy");
    const cookie = `cms-session=${await editToken()}`;
    for (const p of ["/admin", "/api/admin/backups?site=sanneandersen", "/api/cms/registry/export-schema?site=sanneandersen"]) {
      const res = await proxy(new NextRequest(`https://webhouse.app${p}`, { headers: { cookie } }));
      expect(res.status, p).toBe(403);
    }
  });
});
