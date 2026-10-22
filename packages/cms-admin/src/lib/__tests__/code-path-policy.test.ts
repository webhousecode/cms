/**
 * Security W41 C5 — upload a .ts, then have the server jiti-load it: code
 * execution in cms-admin. Both links are cut.
 */
import { describe, it, expect } from "vitest";
import { isCodeUpload, configLoadAllowed } from "../code-path-policy";

describe("isCodeUpload", () => {
  it("refuses files a runtime would load as code, in any case", () => {
    for (const f of ["x.ts", "X.TS", "evil.mjs", "a.cjs", "shell.sh", "p.php", "c.config.tsx"]) expect(isCodeUpload(f), f).toBe(true);
  });
  it("accepts media and documents", () => {
    for (const f of ["photo.jpg", "clip.webm", "doc.pdf", "data.json", "font.woff2", "noext"]) expect(isCodeUpload(f), f).toBe(false);
  });
});

describe("configLoadAllowed", () => {
  const active = "/data/sites/a/cms.config.ts";
  it("the active site's own config is always loadable", () => {
    expect(configLoadAllowed("/data/sites/a/cms.config.ts", active, { instanceAdmin: false, env: { CMS_SERVER_BUILDS: "off" } })).toBe(true);
  });
  it("any other path is refused for a site admin, even on a self-hosted server", () => {
    expect(configLoadAllowed("/data/sites/a/public/uploads/x.ts", active, { instanceAdmin: false, env: {} })).toBe(false);
    expect(configLoadAllowed("/data/sites/a/../b/cms.config.ts", active, { instanceAdmin: false, env: {} })).toBe(false);
  });
  it("on the hosted server (CMS_SERVER_BUILDS=off) not even the instance admin loads an arbitrary path", () => {
    expect(configLoadAllowed("/tmp/x.ts", active, { instanceAdmin: true, env: { CMS_SERVER_BUILDS: "off" } })).toBe(false);
  });
  it("self-hosted instance admin may validate a not-yet-registered config", () => {
    expect(configLoadAllowed("/home/me/new/cms.config.ts", active, { instanceAdmin: true, env: {} })).toBe(true);
  });
});
