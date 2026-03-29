import { type NextRequest, NextResponse } from "next/server";
import { NextSSETransport, registerTransportSession } from "@webhouse/cms-mcp-client";
import { createAdminMcpServer, initAuditLog, type AiGenerator, type AdminServices } from "@webhouse/cms-mcp-server";
import { getApiKey } from "@/lib/ai-config";
import { resolveApiKeyToSite } from "@/lib/mcp-config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Resolve API key → specific org+site (no cookie dependency)
  const resolved = await resolveApiKeyToSite(request.headers.get("authorization"));
  if (!resolved) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  // Load CMS instance for the resolved site (not the cookie-active site)
  const { getOrCreateInstance } = await import("@/lib/site-pool");
  const { loadRegistry } = await import("@/lib/site-registry");
  const { findSite } = await import("@/lib/site-registry");
  const { getSiteDataDir } = await import("@/lib/site-paths");

  let cms: Awaited<ReturnType<typeof import("@webhouse/cms").createCms>>;
  let config: import("@webhouse/cms").CmsConfig;
  let dataDir: string;

  if (resolved.orgId === "default" && resolved.siteId === "default") {
    // Single-site mode — use standard resolution
    const { getAdminCms, getAdminConfig } = await import("@/lib/cms");
    const { getActiveSitePaths } = await import("@/lib/site-paths");
    cms = await getAdminCms();
    config = await getAdminConfig();
    const paths = await getActiveSitePaths();
    dataDir = paths.dataDir;
  } else {
    // Multi-site mode — load the specific site the key belongs to
    const registry = await loadRegistry();
    if (!registry) {
      return NextResponse.json({ error: "Registry not found" }, { status: 500 });
    }
    const site = findSite(registry, resolved.orgId, resolved.siteId);
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }
    const instance = await getOrCreateInstance(resolved.orgId, site);
    cms = instance.cms;
    config = instance.config;
    const dir = await getSiteDataDir(resolved.orgId, resolved.siteId);
    if (!dir) {
      return NextResponse.json({ error: "Site data dir not found" }, { status: 500 });
    }
    dataDir = dir;
  }

  // Init audit log in the resolved site's _data dir
  initAuditLog(dataDir);

  // Build AI generator if Anthropic API key is configured
  let ai: AiGenerator | undefined;
  const anthropicKey = await getApiKey("anthropic");
  if (anthropicKey) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cmsAi = await import("@webhouse/cms-ai" as any);
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const provider = new cmsAi.AnthropicProvider({ apiKey: anthropicKey });
    const agent = new cmsAi.ContentAgent(provider);

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
        const { getModel } = await import("@/lib/ai/model-resolver");
        const { buildLocaleInstruction } = await import("@/lib/ai/locale-prompt");
        const { readSiteConfig } = await import("@/lib/site-config");
        const model = await getModel("code");
        const sc = await readSiteConfig();
        const locale = sc.defaultLocale || "en";
        const client = new Anthropic({ apiKey: anthropicKey });
        const doc = await cms.content.findBySlug(collection, slug);
        const response = await client.messages.create({
          model,
          max_tokens: 2048,
          system: `${buildLocaleInstruction(locale)}\nYou are a content writer. Generate content for the "${field}" field.\nExisting document: ${JSON.stringify(doc?.data ?? {}, null, 2)}`,
          messages: [{ role: "user", content: prompt }],
        });
        return response.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
      },
      async generateInteractive(title: string, description: string) {
        const { getModel } = await import("@/lib/ai/model-resolver");
        const model = await getModel("code");
        const client = new Anthropic({ apiKey: anthropicKey });
        const response = await client.messages.create({
          model,
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

  // Build admin services — wires admin-only imports to MCP server
  const services: AdminServices = {
    async readSiteConfig() {
      const { readSiteConfig } = await import("@/lib/site-config");
      const sc = await readSiteConfig();
      const safe = { ...sc } as Record<string, unknown>;
      delete safe.anthropicApiKey; delete safe.openaiApiKey;
      return safe;
    },
    async writeSiteConfig(patch: Record<string, unknown>) {
      const { writeSiteConfig } = await import("@/lib/site-config");
      return await writeSiteConfig(patch as any);
    },
    async listMedia(type: string, limit: number) {
      const { getMediaAdapter } = await import("@/lib/media");
      const { readMediaMeta } = await import("@/lib/media/media-meta");
      const [files, meta] = await Promise.all([getMediaAdapter().then(a => a.listMedia()), readMediaMeta()]);
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
      const { getMediaAdapter } = await import("@/lib/media");
      const { readMediaMeta } = await import("@/lib/media/media-meta");
      const [files, meta] = await Promise.all([getMediaAdapter().then(a => a.listMedia()), readMediaMeta()]);
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
          if (m?.aiTags?.some(t => t.toLowerCase().includes(q))) score += 4;
          if (m?.tags?.some(t => t.toLowerCase().includes(q))) score += 6;
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
    async listAgents() {
      const { listAgents } = await import("@/lib/agents");
      return await listAgents();
    },
    async createAgent(opts: Record<string, unknown>) {
      const { createAgent } = await import("@/lib/agents");
      return await createAgent({
        name: String(opts.name ?? ""),
        role: String(opts.role ?? "custom") as any,
        systemPrompt: String(opts.systemPrompt ?? ""),
        targetCollections: (opts.targetCollections as string[]) ?? ["posts"],
        active: true,
        behavior: { temperature: 50, formality: 50, verbosity: 50 },
        tools: { webSearch: false, internalDatabase: true },
        autonomy: "draft",
        schedule: { enabled: false, frequency: "manual", time: "09:00", maxPerRun: 1 },
        fieldDefaults: {},
      } as any);
    },
    async runAgent(agentId: string, prompt: string, collection?: string) {
      const { runAgent } = await import("@/lib/agent-runner");
      return await runAgent(agentId, prompt, collection);
    },
    async listCurationQueue(status?: string) {
      const { listQueueItems, getQueueStats } = await import("@/lib/curation");
      const [items, stats] = await Promise.all([listQueueItems(status as any), getQueueStats()]);
      return { items, stats };
    },
    async approveQueueItem(id: string, asDraft: boolean) {
      const { approveQueueItem } = await import("@/lib/curation");
      return await approveQueueItem(id, asDraft);
    },
    async rejectQueueItem(id: string, feedback: string) {
      const { rejectQueueItem } = await import("@/lib/curation");
      return await rejectQueueItem(id, feedback);
    },
    async triggerDeploy() {
      const { triggerDeploy } = await import("@/lib/deploy-service");
      return await triggerDeploy();
    },
    async listDeploys() {
      const { listDeploys } = await import("@/lib/deploy-service");
      return await listDeploys();
    },
    async listRevisions(collection: string, slug: string) {
      const { listRevisions } = await import("@/lib/revisions");
      return await listRevisions(collection, slug);
    },
    async readLinkCheckResult() {
      const { readLinkCheckResult } = await import("@/lib/link-check-store");
      return await readLinkCheckResult();
    },
    async createBackup() {
      const { createBackup } = await import("@/lib/backup-service");
      return await createBackup("manual");
    },
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
