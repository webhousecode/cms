import { describe, it, expect } from "vitest";
import { isAllowedForEditSession, isCorsPreflight } from "../../proxy";

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

/**
 * A CORS preflight omits Authorization by spec, so it can never pass the
 * session gate. If it 401s, the browser abandons the real request — the symptom
 * is a feature that "just doesn't work" cross-origin with nothing in the app's
 * own logs. F164.2 shipped with exactly that hole and the link dialog showed
 * "Fejl — prøv igen" on a live site.
 */
describe("CORS preflight", () => {
  it("lets the preflight through for every cross-origin inline-edit endpoint", () => {
    expect(isCorsPreflight("/api/inline-edit/pages", "OPTIONS")).toBe(true);
    expect(isCorsPreflight("/api/inline-edit/toggle", "OPTIONS")).toBe(true);
    expect(isCorsPreflight("/api/cms/sider-content/om-sanne", "OPTIONS")).toBe(true);
  });

  it("is OPTIONS-only — it must not open the real methods", () => {
    for (const m of ["GET", "POST", "PATCH", "DELETE", "PUT"]) {
      expect(isCorsPreflight("/api/inline-edit/pages", m)).toBe(false);
      expect(isCorsPreflight("/api/cms/sider-content/om-sanne", m)).toBe(false);
    }
  });

  it("does not open unrelated routes to an unauthenticated preflight", () => {
    expect(isCorsPreflight("/api/admin/site-config", "OPTIONS")).toBe(false);
    expect(isCorsPreflight("/api/cms/registry", "OPTIONS")).toBe(false);
    expect(isCorsPreflight("/api/inline-edit/token", "OPTIONS")).toBe(false);
  });
});
