/**
 * F144 P2 — Fly Machines API client tests.
 *
 * Covers:
 *   - spawnBuilder POSTs the right payload + parses the response
 *   - awaitBuilderCompletion polls + recognises terminal states
 *   - streamBuilderLogs yields lines + can be cancelled
 *   - Token resolution: explicit override > FLY_API_TOKEN env > error
 *
 * fetch is stubbed via globalThis.fetch override per test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  spawnBuilder,
  awaitBuilderCompletion,
  streamBuilderLogs,
} from "../build-orchestrator/fly-machines";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_TOKEN = process.env.FLY_API_TOKEN;

beforeEach(() => {
  delete process.env.FLY_API_TOKEN;
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_TOKEN) process.env.FLY_API_TOKEN = ORIGINAL_TOKEN;
  else delete process.env.FLY_API_TOKEN;
  vi.useRealTimers();
});

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>): void {
  globalThis.fetch = ((url: string | URL, init?: RequestInit) =>
    impl(url.toString(), init)) as typeof fetch;
}

describe("spawnBuilder", () => {
  it("throws if FLY_API_TOKEN is missing and no override", async () => {
    await expect(
      spawnBuilder({
        appName: "webhouse-builders",
        siteId: "trail",
        sha: "abc12345",
        targetApp: "trail-landing",
        builderImage: "ghcr.io/webhousecode/cms-builder:latest",
        registryToken: "ghs_x",
        callbackUrl: "https://webhouse.app/api/builder/callback",
        callbackToken: "cb_x",
        sourceTarGz: Buffer.from("fake"),
        dockerfile: "FROM node:22",
      }),
    ).rejects.toThrow(/FLY_API_TOKEN/);
  });

  it("POSTs to the right URL with correct payload shape", async () => {
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> = {};
    let capturedHeaders: Record<string, string> = {};

    mockFetch(async (url, init) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init?.body as string);
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(
        JSON.stringify({ id: "machine-abc", region: "arn", state: "starting" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const result = await spawnBuilder({
      appName: "webhouse-builders",
      siteId: "trail",
      sha: "abc12345abcdef67",
      targetApp: "trail-landing",
      builderImage: "ghcr.io/webhousecode/cms-builder:latest",
      registryToken: "ghs_register_x",
      callbackUrl: "https://webhouse.app/api/builder/callback",
      callbackToken: "cb_token_x",
      sourceTarGz: Buffer.from("hello"),
      dockerfile: "FROM node:22",
      flyToken: "fly_test_token",
    });

    expect(result.machineId).toBe("machine-abc");
    expect(result.region).toBe("arn");
    expect(result.state).toBe("starting");

    expect(capturedUrl).toBe(
      "https://api.machines.dev/v1/apps/webhouse-builders/machines",
    );
    expect(capturedHeaders.Authorization).toBe("Bearer fly_test_token");

    expect(capturedBody.name).toMatch(/^build-trail-abc12345-[a-z0-9]+$/);
    expect(capturedBody.region).toBe("arn");
    const config = capturedBody.config as Record<string, unknown>;
    expect(config.image).toBe("ghcr.io/webhousecode/cms-builder:latest");
    expect(config.auto_destroy).toBe(true);
    const env = config.env as Record<string, string>;
    expect(env.SITE_ID).toBe("trail");
    expect(env.SHA).toBe("abc12345abcdef67");
    expect(env.REGISTRY_TOKEN).toBe("ghs_register_x");
    const files = config.files as Array<Record<string, string>>;
    expect(files).toHaveLength(2);
    expect(files[0]!.guest_path).toBe("/build/source.tar.gz");
    expect(files[0]!.raw_value).toBe(Buffer.from("hello").toString("base64"));
    expect(files[1]!.guest_path).toBe("/build/Dockerfile");
    expect(files[1]!.raw_value).toBe(Buffer.from("FROM node:22").toString("base64"));
  });

  it("uses default region=arn + cpus=4 + memory=4096 when unspecified", async () => {
    let body: Record<string, unknown> = {};
    mockFetch(async (_url, init) => {
      body = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ id: "m1", region: "arn", state: "starting" }), { status: 200 });
    });
    await spawnBuilder({
      appName: "wb",
      siteId: "x",
      sha: "abc",
      targetApp: "y",
      builderImage: "img",
      registryToken: "t",
      callbackUrl: "u",
      callbackToken: "c",
      sourceTarGz: Buffer.from(""),
      dockerfile: "",
      flyToken: "f",
    });
    expect(body.region).toBe("arn");
    const guest = (body.config as Record<string, unknown>).guest as Record<string, unknown>;
    expect(guest.cpu_kind).toBe("shared");
    expect(guest.cpus).toBe(4);
    expect(guest.memory_mb).toBe(4096);
  });

  it("propagates errors from non-200 responses", async () => {
    mockFetch(async () => new Response("forbidden", { status: 403 }));
    await expect(
      spawnBuilder({
        appName: "x",
        siteId: "y",
        sha: "z",
        targetApp: "t",
        builderImage: "i",
        registryToken: "r",
        callbackUrl: "u",
        callbackToken: "c",
        sourceTarGz: Buffer.from(""),
        dockerfile: "",
        flyToken: "f",
      }),
    ).rejects.toThrow(/spawn failed.*403/);
  });

  it("falls back to FLY_API_TOKEN env var when no override", async () => {
    process.env.FLY_API_TOKEN = "env_token_value";
    let capturedAuth = "";
    mockFetch(async (_url, init) => {
      capturedAuth = (init?.headers as Record<string, string>).Authorization;
      return new Response(JSON.stringify({ id: "m", region: "arn", state: "starting" }), { status: 200 });
    });
    await spawnBuilder({
      appName: "x",
      siteId: "y",
      sha: "z",
      targetApp: "t",
      builderImage: "i",
      registryToken: "r",
      callbackUrl: "u",
      callbackToken: "c",
      sourceTarGz: Buffer.from(""),
      dockerfile: "",
    });
    expect(capturedAuth).toBe("Bearer env_token_value");
  });
});

describe("awaitBuilderCompletion", () => {
  it("returns success=true when machine reaches stopped with exit code 0", async () => {
    let calls = 0;
    mockFetch(async () => {
      calls++;
      if (calls === 1) return new Response(JSON.stringify({ state: "started", events: [] }));
      return new Response(JSON.stringify({
        state: "stopped",
        events: [{ type: "exit", request: { exit_event: { exit_code: 0 } } }],
      }));
    });

    const result = await awaitBuilderCompletion({
      appName: "wb",
      machineId: "m1",
      flyToken: "f",
      pollIntervalMs: 5,
      maxWaitMs: 5000,
    });

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.finalState).toBe("stopped");
  });

  it("returns success=false when machine reaches failed state", async () => {
    mockFetch(async () =>
      new Response(JSON.stringify({ state: "failed", events: [] })),
    );
    const result = await awaitBuilderCompletion({
      appName: "wb",
      machineId: "m1",
      flyToken: "f",
      pollIntervalMs: 5,
      maxWaitMs: 1000,
    });
    expect(result.success).toBe(false);
    expect(result.finalState).toBe("failed");
  });

  it("returns success=false when machine exits non-zero", async () => {
    mockFetch(async () => new Response(JSON.stringify({
      state: "stopped",
      events: [{ type: "exit", request: { exit_event: { exit_code: 1 } } }],
    })));
    const result = await awaitBuilderCompletion({
      appName: "wb",
      machineId: "m1",
      flyToken: "f",
      pollIntervalMs: 5,
      maxWaitMs: 1000,
    });
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  it("returns timeout state when maxWaitMs elapses", async () => {
    mockFetch(async () =>
      new Response(JSON.stringify({ state: "started", events: [] })),
    );
    const result = await awaitBuilderCompletion({
      appName: "wb",
      machineId: "m1",
      flyToken: "f",
      pollIntervalMs: 50,
      maxWaitMs: 100,
    });
    expect(result.success).toBe(false);
    expect(result.finalState).toBe("timeout");
  });

  it("retries through transient errors without giving up", async () => {
    let calls = 0;
    mockFetch(async () => {
      calls++;
      if (calls < 3) return new Response("502 bad gateway", { status: 502 });
      return new Response(JSON.stringify({ state: "stopped", events: [] }));
    });
    const result = await awaitBuilderCompletion({
      appName: "wb",
      machineId: "m1",
      flyToken: "f",
      pollIntervalMs: 5,
      maxWaitMs: 5000,
    });
    expect(result.success).toBe(true);
    expect(calls).toBeGreaterThanOrEqual(3);
  });
});

describe("streamBuilderLogs", () => {
  it("yields each new log line via onLine callback", async () => {
    let calls = 0;
    mockFetch(async () => {
      calls++;
      if (calls === 1) {
        return new Response(JSON.stringify({
          logs: [
            { timestamp: 1, message: "first" },
            { timestamp: 2, message: "second" },
          ],
        }));
      }
      return new Response(JSON.stringify({
        logs: [
          { timestamp: 1, message: "first (dup)" },
          { timestamp: 2, message: "second (dup)" },
          { timestamp: 3, message: "third" },
        ],
      }));
    });

    const lines: string[] = [];
    const cancel = streamBuilderLogs({
      appName: "wb",
      machineId: "m1",
      flyToken: "f",
      pollIntervalMs: 10,
      onLine: (l) => lines.push(l),
    });

    await new Promise((r) => setTimeout(r, 50));
    cancel();
    await new Promise((r) => setTimeout(r, 30));

    // first poll yields ["first", "second"]; second yields ["third"]
    // duplicates filtered by timestamp comparison
    expect(lines).toEqual(["first", "second", "third"]);
  });

  it("can be cancelled — onLine stops being called", async () => {
    mockFetch(async () =>
      new Response(JSON.stringify({
        logs: [{ timestamp: Date.now() + Math.random(), message: "spam" }],
      })),
    );
    let count = 0;
    const cancel = streamBuilderLogs({
      appName: "wb",
      machineId: "m1",
      flyToken: "f",
      pollIntervalMs: 5,
      onLine: () => { count++; },
    });
    await new Promise((r) => setTimeout(r, 30));
    cancel();
    const countAtCancel = count;
    await new Promise((r) => setTimeout(r, 30));
    // After cancel, count should not grow (or grow by very little — one
    // in-flight poll might land)
    expect(count).toBeLessThanOrEqual(countAtCancel + 1);
  });
});
