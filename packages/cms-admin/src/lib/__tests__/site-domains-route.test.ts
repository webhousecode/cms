import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ROLE_PERMISSIONS, PERMISSIONS, hasPermission } from "../permissions-shared";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const route = readFileSync(join(SRC, "app/api/admin/site-domains/route.ts"), "utf-8");
const panel = readFileSync(join(SRC, "components/settings/site-domains-panel.tsx"), "utf-8");

describe("site.domains is a security boundary, not a content setting", () => {
  it("the permission exists and is described", () => {
    expect(PERMISSIONS["site.domains"]).toBeTruthy();
  });

  // The list decides which foreign pages may save content and post forms to
  // this site. An editor may change what the site SAYS, not who is allowed to
  // talk to it.
  it("an editor cannot manage domains; an admin can", () => {
    expect(hasPermission(ROLE_PERMISSIONS.editor, "site.domains")).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.viewer, "site.domains")).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.admin, "site.domains")).toBe(true);
  });

  it("BOTH verbs are gated — reading the list is not public either", () => {
    // Positive control: prove the file was actually read.
    expect(route.length, "route is empty — guard scanned nothing").toBeGreaterThan(500);
    for (const verb of ["GET", "PUT"]) {
      const start = route.indexOf(`export async function ${verb}(`);
      expect(start, `${verb} not found — guard scanned nothing`).toBeGreaterThan(0);
      const next = route.indexOf("export async function ", start + 10);
      const body = route.slice(start, next === -1 ? undefined : next);
      expect(body, `${verb} is ungated`).toContain('requirePermission("site.domains")');
    }
  });

  // A route that echoes its own input cannot tell a successful write from a
  // no-op — the failure mode this repo has met most often.
  it("PUT answers with what was STORED, re-read from config", () => {
    const start = route.indexOf("export async function PUT(");
    const body = route.slice(start);
    expect(body).toContain("await writeSiteConfig({ siteDomains:");
    expect(body.indexOf("await readSiteConfig()")).toBeGreaterThan(body.indexOf("await writeSiteConfig("));
  });
});

describe("the domains panel follows house rules", () => {
  it("uses the house Yes/No confirm, never a native dialog", () => {
    expect(panel).not.toMatch(/window\.(confirm|alert|prompt)/);
    expect(panel).toContain("Fjern?");
    expect(panel).toContain(">Yes<");
    expect(panel).toContain(">No<");
  });

  it("every interactive element carries a data-testid so Lens can drive it", () => {
    for (const id of [
      "site-domains-root",
      "site-domains-input",
      "site-domains-add",
      "site-domains-remove-",
      "site-domains-remove-yes-",
      "site-domains-remove-no-",
    ]) {
      expect(panel, `missing ${id}`).toContain(id);
    }
  });

  it("shows the server's answer, not its own optimistic guess", () => {
    // setDomains(data.…) after the PUT — never setDomains(next).
    expect(panel).toContain("setDomains(data.domains ?? [])");
    expect(panel).not.toMatch(/setDomains\(next\)/);
  });
});
