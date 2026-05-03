/**
 * F144 P8 — GitHub webhook helper tests.
 *
 * Verifies signature verification + push-event parsing. The route
 * handler is exercised separately via integration; these tests pin
 * down the pure functions.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";

import {
  verifyGitHubSignature,
  parsePushEvent,
  findSitesByGitHubRepo,
} from "../build-orchestrator/github-webhook";

const SECRET = "test-webhook-secret";

function sign(body: string, secret = SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

describe("verifyGitHubSignature", () => {
  it("accepts a correct signature", () => {
    const body = '{"action":"push"}';
    const sig = sign(body);
    expect(verifyGitHubSignature(body, sig, SECRET).valid).toBe(true);
  });

  it("rejects when header is missing", () => {
    const r = verifyGitHubSignature("body", null, SECRET);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("missing_signature");
  });

  it("rejects when header doesn't start with sha256=", () => {
    const r = verifyGitHubSignature("body", "md5=garbage", SECRET);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("bad_format");
  });

  it("rejects when secret is empty", () => {
    const r = verifyGitHubSignature("body", "sha256=abc", "");
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("no_secret_configured");
  });

  it("rejects when body has been tampered", () => {
    const orig = '{"action":"push"}';
    const sig = sign(orig);
    const tampered = '{"action":"PUSH"}';
    const r = verifyGitHubSignature(tampered, sig, SECRET);
    expect(r.valid).toBe(false);
  });

  it("rejects when secret is wrong", () => {
    const body = '{"action":"push"}';
    const sig = sign(body, "different-secret");
    const r = verifyGitHubSignature(body, sig, SECRET);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("bad_signature");
  });

  it("rejects mismatched-length signatures without throwing", () => {
    const r = verifyGitHubSignature("body", "sha256=tooshort", SECRET);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("bad_length");
  });
});

describe("parsePushEvent", () => {
  it("extracts repo / ref / sha / branch / defaultBranch from a typical push", () => {
    const payload = {
      ref: "refs/heads/main",
      after: "abc123def456",
      repository: {
        full_name: "webhousecode/trail-landing",
        default_branch: "main",
      },
    };
    const r = parsePushEvent(payload);
    expect(r).not.toBeNull();
    expect(r!.repoFullName).toBe("webhousecode/trail-landing");
    expect(r!.ref).toBe("refs/heads/main");
    expect(r!.sha).toBe("abc123def456");
    expect(r!.branch).toBe("main");
    expect(r!.defaultBranch).toBe("main");
  });

  it("returns null when payload is missing required fields", () => {
    expect(parsePushEvent(null)).toBeNull();
    expect(parsePushEvent({})).toBeNull();
    expect(parsePushEvent({ ref: "refs/heads/main" })).toBeNull(); // missing repo
    expect(parsePushEvent({ ref: "refs/heads/main", repository: { full_name: "x/y" } })).toBeNull(); // missing after
  });

  it("returns null branch when ref is a tag (not a heads ref)", () => {
    const r = parsePushEvent({
      ref: "refs/tags/v1.0.0",
      after: "abc",
      repository: { full_name: "x/y" },
    });
    expect(r?.branch).toBeNull();
  });
});

describe("findSitesByGitHubRepo", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns matching sites by configPath prefix (case-insensitive)", async () => {
    vi.doMock("../site-registry", () => ({
      loadRegistry: async () => ({
        orgs: [
          {
            id: "org1",
            sites: [
              { id: "trail", configPath: "github://WebhouseCode/trail-landing/cms.config.ts", adapter: "github" },
              { id: "other", configPath: "/local/path/cms.config.ts", adapter: "filesystem" },
            ],
          },
          {
            id: "org2",
            sites: [
              { id: "ext", configPath: "github://OtherOwner/repo/cms.config.ts", adapter: "github" },
            ],
          },
        ],
      }),
    }));
    const { findSitesByGitHubRepo: findFn } = await import("../build-orchestrator/github-webhook");
    const matches = await findFn("webhousecode/trail-landing");
    expect(matches.map((m) => m.siteId)).toEqual(["trail"]);
    expect(matches[0]!.orgId).toBe("org1");
  });

  it("returns multiple matches when one repo hosts multiple sites", async () => {
    vi.doMock("../site-registry", () => ({
      loadRegistry: async () => ({
        orgs: [{
          id: "org1",
          sites: [
            { id: "site1", configPath: "github://acme/mono/site1/cms.config.ts", adapter: "github" },
            { id: "site2", configPath: "github://acme/mono/site2/cms.config.ts", adapter: "github" },
          ],
        }],
      }),
    }));
    const { findSitesByGitHubRepo: findFn } = await import("../build-orchestrator/github-webhook");
    const matches = await findFn("acme/mono");
    expect(matches).toHaveLength(2);
  });

  it("returns empty list when no site matches", async () => {
    vi.doMock("../site-registry", () => ({
      loadRegistry: async () => ({ orgs: [] }),
    }));
    const { findSitesByGitHubRepo: findFn } = await import("../build-orchestrator/github-webhook");
    expect(await findFn("nobody/here")).toEqual([]);
  });

  it("returns empty list when registry load fails", async () => {
    vi.doMock("../site-registry", () => ({ loadRegistry: async () => null }));
    const { findSitesByGitHubRepo: findFn } = await import("../build-orchestrator/github-webhook");
    expect(await findFn("x/y")).toEqual([]);
  });
});
