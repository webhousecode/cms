import { type NextRequest, NextResponse } from "next/server";
import { NextSSETransport, registerTransportSession } from "@webhouse/cms-mcp-client";
import { createAdminMcpServer, initAuditLog, type AiGenerator } from "@webhouse/cms-mcp-server";
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
    };
  }

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
