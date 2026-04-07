/**
 * Phase 6 — agent template library tests.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

let TMP_DIR = "";

vi.mock("../site-registry", () => ({
  getAdminDataDir: () => TMP_DIR,
}));

import {
  agentToTemplatePayload,
  templateToAgentInput,
  listLocalTemplates,
  getLocalTemplate,
  saveLocalTemplate,
  deleteLocalTemplate,
} from "../agent-templates";
import { fetchMarketplaceTemplates, clearMarketplaceCache } from "../marketplace-templates";
import type { AgentConfig } from "../agents";

function makeAgent(over: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: "writer-1",
    name: "Content Writer",
    role: "copywriter",
    systemPrompt: "Write well.",
    behavior: { temperature: 65, formality: 50, verbosity: 60 },
    tools: { webSearch: false, internalDatabase: true },
    autonomy: "draft",
    targetCollections: ["posts"],
    schedule: { enabled: true, frequency: "daily", time: "06:00", maxPerRun: 3 },
    stats: { totalGenerated: 99, approved: 80, rejected: 5, edited: 14 },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    active: true,
    dailyBudgetUsd: 1.5,
    weeklyBudgetUsd: 10,
    monthlyBudgetUsd: 30,
    locale: "en",
    ...over,
  };
}

beforeEach(async () => {
  TMP_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "agent-templates-"));
  clearMarketplaceCache();
});

describe("agentToTemplatePayload", () => {
  it("strips per-instance fields", () => {
    const payload = agentToTemplatePayload(makeAgent());
    // Stripped
    expect("id" in payload).toBe(false);
    expect("createdAt" in payload).toBe(false);
    expect("updatedAt" in payload).toBe(false);
    expect("stats" in payload).toBe(false);
    expect("schedule" in payload).toBe(false);
    expect("active" in payload).toBe(false);
    expect("dailyBudgetUsd" in payload).toBe(false);
    expect("weeklyBudgetUsd" in payload).toBe(false);
    expect("monthlyBudgetUsd" in payload).toBe(false);
    expect("locale" in payload).toBe(false);
    // Kept
    expect(payload.name).toBe("Content Writer");
    expect(payload.role).toBe("copywriter");
    expect(payload.systemPrompt).toBe("Write well.");
    expect(payload.behavior.temperature).toBe(65);
    expect(payload.tools.internalDatabase).toBe(true);
  });
});

describe("templateToAgentInput", () => {
  it("produces a fresh agent input with default schedule and active=true", () => {
    const tpl = {
      id: "t1",
      name: "T",
      description: "",
      source: "local" as const,
      createdAt: new Date().toISOString(),
      payload: agentToTemplatePayload(makeAgent()),
    };
    const input = templateToAgentInput(tpl);
    expect(input.active).toBe(true);
    expect(input.schedule.enabled).toBe(false);
    expect(input.schedule.frequency).toBe("manual");
    expect(input.name).toBe("Content Writer");
  });

  it("honours name override", () => {
    const tpl = {
      id: "t1",
      name: "T",
      description: "",
      source: "local" as const,
      createdAt: new Date().toISOString(),
      payload: agentToTemplatePayload(makeAgent()),
    };
    const input = templateToAgentInput(tpl, { name: "My Custom Writer" });
    expect(input.name).toBe("My Custom Writer");
  });
});

describe("local template storage", () => {
  it("returns empty list before any saves", async () => {
    expect(await listLocalTemplates("acme")).toEqual([]);
  });

  it("saves and reads back a template", async () => {
    const saved = await saveLocalTemplate("acme", {
      name: "Fitness Coach",
      description: "Writes fitness articles",
      category: "fitness",
      payload: agentToTemplatePayload(makeAgent({ name: "Fitness Coach" })),
    });
    expect(saved.id).toMatch(/^tpl-/);
    expect(saved.source).toBe("local");

    const list = await listLocalTemplates("acme");
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Fitness Coach");

    const fetched = await getLocalTemplate("acme", saved.id);
    expect(fetched?.name).toBe("Fitness Coach");
  });

  it("isolates templates by org id", async () => {
    await saveLocalTemplate("acme", {
      name: "A", description: "",
      payload: agentToTemplatePayload(makeAgent()),
    });
    await saveLocalTemplate("globex", {
      name: "B", description: "",
      payload: agentToTemplatePayload(makeAgent()),
    });
    const acme = await listLocalTemplates("acme");
    const globex = await listLocalTemplates("globex");
    expect(acme).toHaveLength(1);
    expect(globex).toHaveLength(1);
    expect(acme[0].name).toBe("A");
    expect(globex[0].name).toBe("B");
  });

  it("deletes a template by id", async () => {
    const saved = await saveLocalTemplate("acme", {
      name: "Doomed", description: "",
      payload: agentToTemplatePayload(makeAgent()),
    });
    await deleteLocalTemplate("acme", saved.id);
    expect(await getLocalTemplate("acme", saved.id)).toBeNull();
  });
});

describe("marketplace connector", () => {
  it("returns primary endpoint templates when reachable", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).startsWith("https://webhouse.app")) {
        return new Response(
          JSON.stringify({
            templates: [{ id: "mk-1", name: "Marketplace Writer", description: "x", source: "marketplace", createdAt: "2026-01-01", payload: { name: "Marketplace Writer", role: "copywriter", systemPrompt: "x", behavior: { temperature: 50, formality: 50, verbosity: 50 }, tools: { webSearch: false, internalDatabase: true }, autonomy: "draft", targetCollections: [] } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    });
    const result = await fetchMarketplaceTemplates({ fetchImpl: fetchMock as never });
    expect(result.source).toBe("primary");
    expect(result.templates).toHaveLength(1);
    expect(result.templates[0].name).toBe("Marketplace Writer");
    expect(result.templates[0].source).toBe("marketplace");
  });

  it("falls back to GitHub when primary 404s", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.startsWith("https://webhouse.app")) return new Response("nope", { status: 404 });
      if (u.endsWith("/manifest.json")) {
        return new Response(JSON.stringify({ templates: [{ file: "writer.json" }] }), {
          status: 200, headers: { "content-type": "application/json" },
        });
      }
      if (u.endsWith("/writer.json")) {
        return new Response(
          JSON.stringify({ id: "gh-1", name: "GH Writer", description: "from gh", source: "marketplace", createdAt: "2026-01-01", payload: {} }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    });
    const result = await fetchMarketplaceTemplates({ fetchImpl: fetchMock as never });
    expect(result.source).toBe("fallback");
    expect(result.templates).toHaveLength(1);
    expect(result.templates[0].name).toBe("GH Writer");
  });

  it("returns empty + error when both sources fail", async () => {
    const fetchMock = vi.fn(async () => new Response("down", { status: 503 }));
    const result = await fetchMarketplaceTemplates({ fetchImpl: fetchMock as never });
    expect(result.source).toBe("empty");
    expect(result.templates).toEqual([]);
    expect(result.error).toBeTruthy();
  });

  it("caches results within the TTL window", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      return new Response(JSON.stringify({ templates: [] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    await fetchMarketplaceTemplates({ fetchImpl: fetchMock as never });
    await fetchMarketplaceTemplates({ fetchImpl: fetchMock as never });
    expect(calls).toBe(1);
  });

  it("force=true bypasses the cache", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      return new Response(JSON.stringify({ templates: [] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    await fetchMarketplaceTemplates({ fetchImpl: fetchMock as never });
    await fetchMarketplaceTemplates({ fetchImpl: fetchMock as never, force: true });
    expect(calls).toBe(2);
  });
});
