import { type NextRequest, NextResponse } from "next/server";
import { NextSSETransport, registerTransportSession } from "@webhouse/cms-mcp-client";
import { createAdminMcpServer, initAuditLog, type AiGenerator, type AdminServices } from "@webhouse/cms-mcp-server";
import { getApiKey } from "@/lib/ai-config";
import { resolveApiKeyToSite } from "@/lib/mcp-config";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Resolve API key → specific org+site (no cookie dependency)
  const resolved = await resolveApiKeyToSite(request.headers.get("authorization"));
  if (!resolved) {
    console.warn(`[MCP] Rejected: invalid API key (prefix: ${request.headers.get("authorization")?.slice(7, 15) ?? "none"})`);
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }
  console.log(`[MCP] Session: ${resolved.orgId}/${resolved.siteId} key="${resolved.label}" scopes=[${resolved.scopes}]`);

  // Load CMS instance for the resolved site (not the cookie-active site)
  const { getOrCreateInstance } = await import("@/lib/site-pool");
  const { loadRegistry, findSite } = await import("@/lib/site-registry");
  const { getSiteDataDir, getSitePathsFor } = await import("@/lib/site-paths");

  let cms: Awaited<ReturnType<typeof import("@webhouse/cms").createCms>>;
  let config: import("@webhouse/cms").CmsConfig;
  let dataDir: string;
  let uploadDir: string;
  let projectDir: string;

  if (resolved.orgId === "default" && resolved.siteId === "default") {
    const { getAdminCms, getAdminConfig } = await import("@/lib/cms");
    const { getActiveSitePaths } = await import("@/lib/site-paths");
    cms = await getAdminCms();
    config = await getAdminConfig();
    const paths = await getActiveSitePaths();
    dataDir = paths.dataDir;
    uploadDir = paths.uploadDir;
    projectDir = paths.projectDir;
  } else {
    const registry = await loadRegistry();
    if (!registry) return NextResponse.json({ error: "Registry not found" }, { status: 500 });
    const site = findSite(registry, resolved.orgId, resolved.siteId);
    if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });
    const instance = await getOrCreateInstance(resolved.orgId, site);
    cms = instance.cms;
    config = instance.config;
    const paths = await getSitePathsFor(resolved.orgId, resolved.siteId);
    if (!paths) return NextResponse.json({ error: "Site paths not found" }, { status: 500 });
    dataDir = paths.dataDir;
    uploadDir = paths.uploadDir;
    projectDir = paths.projectDir;
  }

  initAuditLog(dataDir);

  // ── Helper: read JSON from dataDir ──────────────────────────────
  async function readJson<T>(relativePath: string): Promise<T | null> {
    try {
      const raw = await fs.readFile(path.join(dataDir, relativePath), "utf-8");
      return JSON.parse(raw) as T;
    } catch { return null; }
  }

  async function writeJson(relativePath: string, data: unknown): Promise<void> {
    const filePath = path.join(dataDir, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  // ── AI Generator ────────────────────────────────────────────────
  let ai: AiGenerator | undefined;
  const anthropicKey = await getApiKey("anthropic");
  if (anthropicKey) {
    const cmsAi = await import("@webhouse/cms-ai" as any);
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const provider = new cmsAi.AnthropicProvider({ apiKey: anthropicKey });
    const agent = new cmsAi.ContentAgent(provider);

    // Read locale from resolved site config (not cookies)
    const siteConfigData = await readJson<Record<string, unknown>>("site-config.json");
    const siteLocale = String(siteConfigData?.defaultLocale ?? "en");

    ai = {
      async generate(intent: string, collectionName: string) {
        const col = config.collections.find(c => c.name === collectionName);
        if (!col) throw new Error(`Collection "${collectionName}" not found`);
        const result = await agent.generate(intent, { collection: col }) as { fields: Record<string, string>; slug: string };
        return { fields: result.fields, slug: result.slug };
      },
      async rewriteField(_collection: string, _slug: string, field: string, instruction: string, currentValue: string) {
        const col = config.collections[0]!;
        const result = await agent.rewrite({ [field]: currentValue }, { instruction, collection: col }) as { fields: Record<string, string> };
        return result.fields[field] ?? currentValue;
      },
      async generateContent(collection: string, slug: string, field: string, prompt: string) {
        const { buildLocaleInstruction } = await import("@/lib/ai/locale-prompt");
        const model = "claude-sonnet-4-6"; // Use code model directly — no cookie-dependent getModel()
        const client = new Anthropic({ apiKey: anthropicKey });
        const doc = await cms.content.findBySlug(collection, slug);
        const response = await client.messages.create({
          model,
          max_tokens: 2048,
          system: `${buildLocaleInstruction(siteLocale)}\nYou are a content writer. Generate content for the "${field}" field.\nExisting document: ${JSON.stringify(doc?.data ?? {}, null, 2)}`,
          messages: [{ role: "user", content: prompt }],
        });
        return response.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
      },
      async generateInteractive(title: string, description: string) {
        const client = new Anthropic({ apiKey: anthropicKey });
        const response = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 8192,
          system: `You are an expert HTML/CSS/JavaScript developer. Generate a COMPLETE, self-contained HTML document. ALL CSS inline in <style>, ALL JS inline in <script>. NO external dependencies. Responsive, dark mode support. Start with <!DOCTYPE html>, end with </html>.`,
          messages: [{ role: "user", content: `Create: ${title}\n\n${description}` }],
        });
        const raw = response.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
        const fenceMatch = raw.match(/```html\s*([\s\S]*?)```/);
        if (fenceMatch) return fenceMatch[1].trim();
        const docMatch = raw.match(/(<!DOCTYPE html[\s\S]*<\/html>)/i);
        if (docMatch) return docMatch[1];
        return raw;
      },
    };
  }

  // ── Admin Services (ALL cookie-free — use resolved dataDir) ─────
  const { FilesystemMediaAdapter } = await import("@/lib/media/filesystem");

  function createMediaAdapter() {
    return new FilesystemMediaAdapter(uploadDir, dataDir);
  }

  async function readMediaMetaDirect(): Promise<Array<{ key: string; aiCaption?: string; aiAlt?: string; aiTags?: string[]; tags?: string[]; exif?: any; [k: string]: any }>> {
    const data = await readJson<any[]>("media-meta.json");
    return data ?? [];
  }

  const services: AdminServices = {
    // ── Site Config (direct file I/O) ────────────────────────────
    async readSiteConfig() {
      const stored = await readJson<Record<string, unknown>>("site-config.json");
      const safe = { ...stored } as Record<string, unknown>;
      delete safe.anthropicApiKey; delete safe.openaiApiKey;
      delete safe.geminiApiKey; delete safe.braveApiKey;
      delete safe.tavilyApiKey; delete safe.resendApiKey;
      delete safe.deployApiToken; delete safe.calendarSecret;
      return safe;
    },

    async writeSiteConfig(patch: Record<string, unknown>) {
      const existing = await readJson<Record<string, unknown>>("site-config.json") ?? {};
      const next = { ...existing, ...patch };
      await writeJson("site-config.json", next);
      return next;
    },

    // ── Media (direct adapter — no getActiveSitePaths) ───────────
    async listMedia(type: string, limit: number) {
      const adapter = createMediaAdapter();
      const meta = await readMediaMetaDirect();
      const files = await adapter.listMedia();
      const metaMap = new Map(meta.map(m => [m.key, m]));
      let filtered = files.filter(f => !/-\d+w\.webp$/i.test(f.name));
      if (type !== "all") filtered = filtered.filter(f => f.mediaType === type);
      filtered = filtered.slice(0, Math.min(limit, 200));
      if (filtered.length === 0) return "No files found.";
      return filtered.map(f => {
        const key = f.folder ? `${f.folder}/${f.name}` : f.name;
        const m = metaMap.get(key);
        const parts = [`- ${f.name} (${f.mediaType}, ${Math.round(f.size / 1024)}KB)`, `  URL: ${f.url}`];
        if (m?.aiCaption) parts.push(`  Caption: ${m.aiCaption}`);
        if (m?.aiTags?.length) parts.push(`  Tags: ${m.aiTags.join(", ")}`);
        if (m?.tags?.length) parts.push(`  User tags: ${m.tags.join(", ")}`);
        return parts.join("\n");
      }).join("\n\n");
    },

    async searchMedia(query: string, type: string, limit: number) {
      const adapter = createMediaAdapter();
      const meta = await readMediaMetaDirect();
      const files = await adapter.listMedia();
      const metaMap = new Map(meta.map(m => [m.key, m]));
      const q = query.toLowerCase();
      const scored = files
        .filter(f => !/-\d+w\.webp$/i.test(f.name))
        .filter(f => type === "all" || f.mediaType === type)
        .map(f => {
          const key = f.folder ? `${f.folder}/${f.name}` : f.name;
          const m = metaMap.get(key);
          let score = 0;
          if (f.name.toLowerCase().includes(q)) score += 3;
          if (m?.aiCaption?.toLowerCase().includes(q)) score += 5;
          if (m?.aiTags?.some((t: string) => t.toLowerCase().includes(q))) score += 4;
          if (m?.tags?.some((t: string) => t.toLowerCase().includes(q))) score += 6;
          return { file: f, meta: m, score };
        })
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.min(limit, 50));
      if (scored.length === 0) return `No media matching "${query}".`;
      return scored.map(({ file: f, meta: m }) => {
        const parts = [`- ${f.name} (${f.mediaType})`, `  URL: ${f.url}`];
        if (m?.aiCaption) parts.push(`  Caption: ${m.aiCaption}`);
        if (m?.tags?.length) parts.push(`  User tags: ${m.tags.join(", ")}`);
        if (m?.aiTags?.length) parts.push(`  AI tags: ${m.aiTags.join(", ")}`);
        return parts.join("\n");
      }).join("\n\n");
    },

    async listTrashedMedia() {
      const adapter = createMediaAdapter();
      return await adapter.listTrashed();
    },

    async deleteTrashedMedia() {
      const adapter = createMediaAdapter();
      const trashed = await adapter.listTrashed();
      let deleted = 0;
      for (const m of trashed) {
        await adapter.deleteFile(m.folder, m.name);
        deleted++;
      }
      return deleted;
    },

    // ── Agents (direct file I/O) ─────────────────────────────────
    async listAgents() {
      const agentsDir = path.join(dataDir, "agents");
      try {
        const files = await fs.readdir(agentsDir);
        const agents = [];
        for (const f of files) {
          if (!f.endsWith(".json")) continue;
          try {
            const raw = await fs.readFile(path.join(agentsDir, f), "utf-8");
            agents.push(JSON.parse(raw));
          } catch { /* skip */ }
        }
        return agents.sort((a: any, b: any) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
      } catch {
        return [];
      }
    },

    async createAgent(opts: Record<string, unknown>) {
      const agentsDir = path.join(dataDir, "agents");
      await fs.mkdir(agentsDir, { recursive: true });
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const agent = {
        id,
        name: String(opts.name ?? ""),
        role: String(opts.role ?? "custom"),
        systemPrompt: String(opts.systemPrompt ?? ""),
        targetCollections: (opts.targetCollections as string[]) ?? ["posts"],
        active: true,
        behavior: { temperature: 50, formality: 50, verbosity: 50 },
        tools: { webSearch: false, internalDatabase: true },
        autonomy: "draft",
        schedule: { enabled: false, frequency: "manual", time: "09:00", maxPerRun: 1 },
        fieldDefaults: {},
        createdAt: now,
        updatedAt: now,
      };
      await fs.writeFile(path.join(agentsDir, `${id}.json`), JSON.stringify(agent, null, 2));
      return agent;
    },

    async runAgent(agentId: string, prompt: string, collection?: string) {
      // runAgent is complex (calls AI APIs) — use internal HTTP endpoint
      const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3010}`;
      const serviceToken = process.env.CMS_JWT_SECRET ?? "";
      const res = await fetch(`${baseUrl}/api/cms/agents/${agentId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cms-service-token": serviceToken },
        body: JSON.stringify({ prompt, collection }),
      });
      if (!res.ok) throw new Error("Agent run failed");
      return await res.json();
    },

    // ── Curation Queue (direct file I/O) ─────────────────────────
    async listCurationQueue(status?: string) {
      const queue = await readJson<any[]>("curation-queue.json") ?? [];
      const filtered = status ? queue.filter((i: any) => i.status === status) : queue;
      const stats: Record<string, number> = {};
      for (const item of queue) {
        const s = item.status ?? "ready";
        stats[s] = (stats[s] ?? 0) + 1;
      }
      return { items: filtered, stats };
    },

    async approveQueueItem(id: string, asDraft: boolean) {
      const queue = await readJson<any[]>("curation-queue.json") ?? [];
      const item = queue.find((i: any) => i.id === id);
      if (!item) throw new Error("Queue item not found");
      item.status = asDraft ? "approved" : "published";
      item.reviewedAt = new Date().toISOString();
      await writeJson("curation-queue.json", queue);

      // Create document in CMS
      if (item.data && item.collection) {
        await cms.content.create(item.collection, {
          data: item.data,
          slug: item.slug,
          status: asDraft ? "draft" : "published",
        });
      }
      return item;
    },

    async rejectQueueItem(id: string, feedback: string) {
      const queue = await readJson<any[]>("curation-queue.json") ?? [];
      const item = queue.find((i: any) => i.id === id);
      if (!item) throw new Error("Queue item not found");
      item.status = "rejected";
      item.feedback = feedback;
      item.reviewedAt = new Date().toISOString();
      await writeJson("curation-queue.json", queue);
      return item;
    },

    // ── Deploy (direct file I/O for history, internal API for trigger) ─
    async triggerDeploy() {
      // Deploy is very complex (Fly.io, Vercel, Netlify, GH Pages) — use internal HTTP
      const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3010}`;
      const serviceToken = process.env.CMS_JWT_SECRET ?? "";
      const res = await fetch(`${baseUrl}/api/admin/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cms-service-token": serviceToken },
      });
      if (!res.ok) throw new Error("Deploy failed");
      return await res.json();
    },

    async listDeploys() {
      const log = await readJson<any[]>("deploy-log.json");
      return log ?? [];
    },

    // ── Revisions (direct file I/O) ──────────────────────────────
    async listRevisions(collection: string, slug: string) {
      const revPath = path.join(projectDir, "_revisions", collection, `${slug}.json`);
      try {
        const raw = await fs.readFile(revPath, "utf-8");
        return JSON.parse(raw);
      } catch {
        return [];
      }
    },

    // ── Link Check (direct file I/O) ─────────────────────────────
    async readLinkCheckResult() {
      return await readJson("link-check-result.json");
    },

    // ── Backup (direct file I/O for create) ──────────────────────
    async createBackup() {
      // Backup is complex (zip creation) — use internal HTTP
      const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3010}`;
      const serviceToken = process.env.CMS_JWT_SECRET ?? "";
      const res = await fetch(`${baseUrl}/api/admin/backup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cms-service-token": serviceToken },
        body: JSON.stringify({ trigger: "manual" }),
      });
      if (!res.ok) throw new Error("Backup failed");
      return await res.json();
    },

    // ── Translation (internal HTTP — these endpoints handle their own site resolution) ─
    async translateDocument(collection: string, slug: string, targetLocale: string, publish: boolean) {
      const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3010}`;
      const serviceToken = process.env.CMS_JWT_SECRET ?? "";
      const res = await fetch(`${baseUrl}/api/cms/${collection}/${slug}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cms-service-token": serviceToken },
        body: JSON.stringify({ targetLocale, publish }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error ?? "Translation failed"); }
      return await res.json();
    },

    async translateSite(targetLocale: string, publish: boolean) {
      const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3010}`;
      const serviceToken = process.env.CMS_JWT_SECRET ?? "";
      const res = await fetch(`${baseUrl}/api/admin/translate-bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cms-service-token": serviceToken },
        body: JSON.stringify({ targetLocale, publish }),
      });
      if (!res.ok) throw new Error("Bulk translation failed");
      const text = await res.text();
      const lines = text.trim().split("\n").map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const results = lines.filter((l: any) => l.type === "result");
      const errors = lines.filter((l: any) => l.type === "error");
      return { translated: results.length, errors: errors.length, details: results.map((r: any) => `${r.collection}/${r.slug}`) };
    },
  };

  const sessionId = crypto.randomUUID();
  const origin = request.headers.get("origin") ?? request.nextUrl.origin;
  const messageUrl = `${origin}/api/mcp/admin/message?sessionId=${sessionId}`;
  const transport = new NextSSETransport(sessionId, messageUrl);
  registerTransportSession(transport);

  const server = createAdminMcpServer({
    content: cms.content,
    config,
    scopes: resolved.scopes,
    actor: `${resolved.label} (${resolved.orgId}/${resolved.siteId})`,
    ai,
    services,
  });

  await server.connect(transport);

  return new Response(transport.stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      "X-MCP-Session-Id": sessionId,
    },
  });
}
