/**
 * Security W41 C4 — the mobile preview proxy was an SSRF and an
 * arbitrary-directory reader.
 */
import { describe, it, expect } from "vitest";
import { isLoopbackUrl, upstreamTarget, distDirAllowed } from "../preview-proxy-policy";

describe("upstreamTarget", () => {
  it("relays a path on a localhost dev server", () => {
    expect(upstreamTarget("http://localhost:3034", "/blog/x")).toBe("http://localhost:3034/blog/x");
    expect(upstreamTarget("http://127.0.0.1:8080/base", "/")).toBe("http://127.0.0.1:8080/base/");
  });
  it("refuses a non-loopback upstream (cloud metadata, the internet)", () => {
    expect(upstreamTarget("http://169.254.169.254/", "/")).toBeNull();
    expect(upstreamTarget("https://evil.example", "/")).toBeNull();
    expect(upstreamTarget("http://localhost.evil.example", "/")).toBeNull();
  });
  it("refuses a path that leaves the upstream's origin", () => {
    expect(upstreamTarget("http://localhost:3034", "http://169.254.169.254/")).toBeNull();
    // Leading slashes are stripped, so "//host" becomes a path on the upstream, not a new origin.
    expect(upstreamTarget("http://localhost:3034", "//evil.example/x")).toBe("http://localhost:3034/evil.example/x");
    expect(upstreamTarget("http://localhost:3034", "@evil.example/x")).toBe("http://localhost:3034/@evil.example/x");
  });
});

describe("distDirAllowed", () => {
  const cfgs = ["/sites/a/cms.config.ts", "github://o/r/cms.config.ts"];
  it("only a registered site's own dist/", () => {
    expect(distDirAllowed("/sites/a/dist", cfgs)).toBe(true);
    expect(distDirAllowed("/sites/a/dist/../../../etc", cfgs)).toBe(false);
    expect(distDirAllowed("/data/cms-admin/_data", cfgs)).toBe(false);
    expect(distDirAllowed("/", cfgs)).toBe(false);
  });
});

describe("isLoopbackUrl", () => {
  it("accepts loopback hosts only", () => {
    expect(isLoopbackUrl("http://[::1]:3000/")).toBe(true);
    expect(isLoopbackUrl("http://10.0.0.5:3000/")).toBe(false);
  });
});
