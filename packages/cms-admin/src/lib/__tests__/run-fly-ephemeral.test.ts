/**
 * F144 P7 — runFlyEphemeralDeploy guard tests.
 *
 * Verifies the up-front validation in run-fly-ephemeral.ts (token,
 * appName, callbackBaseUrl, registry token) returns a structured
 * { ok: false, error } instead of throwing — so deploy-service can
 * surface the message in the deploy log.
 *
 * The actual buildSsrSite + deployImageToFly happy path is covered by
 * fly-machines.test.ts, build-orchestrator.test.ts, and is exercised
 * end-to-end at deploy time. This file pins down only the *guards*.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runFlyEphemeralDeploy } from "../build-orchestrator/run-fly-ephemeral";
import type { SiteEntry } from "../site-registry";

const mockSite: SiteEntry = {
  id: "trail",
  name: "Trail",
  configPath: "/tmp/cms.config.ts",
  adapter: "filesystem",
} as unknown as SiteEntry;

const ORIG_TOKEN = process.env.FLY_API_TOKEN;
const ORIG_GHCR = process.env.GHCR_PUSH_TOKEN;
const ORIG_NEXTAUTH = process.env.NEXTAUTH_SECRET;

beforeEach(() => {
  delete process.env.FLY_API_TOKEN;
  delete process.env.GHCR_PUSH_TOKEN;
  process.env.NEXTAUTH_SECRET = "test-secret";
});

afterEach(() => {
  if (ORIG_TOKEN) process.env.FLY_API_TOKEN = ORIG_TOKEN; else delete process.env.FLY_API_TOKEN;
  if (ORIG_GHCR) process.env.GHCR_PUSH_TOKEN = ORIG_GHCR; else delete process.env.GHCR_PUSH_TOKEN;
  if (ORIG_NEXTAUTH) process.env.NEXTAUTH_SECRET = ORIG_NEXTAUTH; else delete process.env.NEXTAUTH_SECRET;
});

describe("runFlyEphemeralDeploy — preflight guards", () => {
  it("rejects when no active site", async () => {
    const r = await runFlyEphemeralDeploy({
      siteEntry: null,
      configToken: "f",
      configAppName: "a",
      configOrg: undefined,
      callbackBaseUrl: "https://x",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no active site/i);
  });

  it("rejects when no Fly token (config or env)", async () => {
    const r = await runFlyEphemeralDeploy({
      siteEntry: mockSite,
      configToken: "",
      configAppName: "a",
      configOrg: undefined,
      callbackBaseUrl: "https://x",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Fly API token/i);
  });

  it("rejects when no deployAppName", async () => {
    const r = await runFlyEphemeralDeploy({
      siteEntry: mockSite,
      configToken: "f",
      configAppName: "",
      configOrg: undefined,
      callbackBaseUrl: "https://x",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/deployAppName/);
  });

  it("rejects when no callbackBaseUrl", async () => {
    const r = await runFlyEphemeralDeploy({
      siteEntry: mockSite,
      configToken: "f",
      configAppName: "a",
      configOrg: undefined,
      callbackBaseUrl: "",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/NEXTAUTH_URL/);
  });

  it("rejects when GHCR push token missing", async () => {
    const r = await runFlyEphemeralDeploy({
      siteEntry: mockSite,
      configToken: "f",
      configAppName: "a",
      configOrg: undefined,
      callbackBaseUrl: "https://x",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/GHCR_PUSH_TOKEN/);
  });

  it("falls back to FLY_API_TOKEN env when configToken empty", async () => {
    process.env.FLY_API_TOKEN = "env_fly";
    process.env.GHCR_PUSH_TOKEN = "env_ghcr";
    // Won't reach buildSsrSite because we don't stub it — but we should
    // get past the guards and either error in buildSsrSite or in the
    // site-paths lookup. Just confirm we're not failing on Fly-token guard.
    const r = await runFlyEphemeralDeploy({
      siteEntry: mockSite,
      configToken: "",
      configAppName: "trail-app",
      configOrg: undefined,
      callbackBaseUrl: "https://x",
    });
    // We expect failure but NOT for the Fly-token reason
    expect(r.ok).toBe(false);
    expect(r.error).not.toMatch(/Fly API token/i);
  });
});
