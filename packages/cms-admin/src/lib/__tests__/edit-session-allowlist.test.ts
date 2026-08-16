import { describe, it, expect } from "vitest";
import { isAllowedForEditSession } from "../../proxy";

/**
 * The editSession allowlist IS the security boundary for inline editing — the
 * token is long-lived and lives in a browser on a public site, so its 30-day
 * TTL and site claim are not sufficient on their own (F157).
 *
 * F164.2 adds exactly ONE route to it: GET /api/inline-edit/pages, the link
 * picker's page list. These tests pin what the token may do, so a future
 * addition has to be deliberate rather than incidental.
 */
const SITE = "sanneandersen";
const allow = (path: string, method: string, reqSite = SITE) =>
  isAllowedForEditSession(path, method, reqSite, SITE);

describe("editSession allowlist", () => {
  it("allows the link picker's page list on its own site", () => {
    expect(allow("/api/inline-edit/pages", "GET")).toBe(true);
  });

  it("refuses the page list for ANOTHER site", () => {
    expect(allow("/api/inline-edit/pages", "GET", "broberg-ai")).toBe(false);
  });

  it("refuses to write through the page list route", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(allow("/api/inline-edit/pages", m)).toBe(false);
    }
  });

  it("still allows exactly what F157 allowed", () => {
    expect(allow("/api/auth/me", "GET")).toBe(true);
    expect(allow("/api/inline-edit/toggle", "POST")).toBe(true);
    expect(allow("/api/cms/sider-content/om-sanne", "GET")).toBe(true);
    expect(allow("/api/cms/sider-content/om-sanne", "PATCH")).toBe(true);
  });

  it("still refuses everything else", () => {
    expect(allow("/api/admin/site-config", "GET")).toBe(false);
    expect(allow("/api/cms/registry", "POST")).toBe(false);
    expect(allow("/api/cms/sider-content/om-sanne", "DELETE")).toBe(false);
    expect(allow("/api/upload", "POST")).toBe(false);
    expect(allow("/api/schema/sync", "POST")).toBe(false);
    // Near-misses on the new route must not open anything.
    expect(allow("/api/inline-edit/pages/secret", "GET")).toBe(false);
    expect(allow("/api/inline-edit", "GET")).toBe(false);
  });
});
