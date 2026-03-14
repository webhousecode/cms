import { type NextRequest, NextResponse } from "next/server";
import { NextSSETransport, registerTransportSession } from "@webhouse/cms-mcp-client";
import { createAdminMcpServer, validateApiKey, initAuditLog, type AiGenerator } from "@webhouse/cms-mcp-server";
import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { getApiKey } from "@/lib/ai-config";
import { getMcpApiKeys } from "@/lib/mcp-config";
import { getActiveSitePaths } from "@/lib/site-paths";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Keys from _data/mcp-config.json (UI-managed) with env var fallback
  const keys = await getMcpApiKeys();
  if (keys.length === 0) {
    return NextResponse.json({
      error: "MCP admin server not configured — add an API key in Settings → MCP"
    }, { status: 503 });
  }

  const auth = validateApiKey(request.headers.get("authorization"), keys);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const cms = await getAdminCms();
  const config = await getAdminConfig();

  // Init audit log in the same _data dir as the rest
  const { dataDir } = await getActiveSitePaths();
  initAuditLog(dataDir);

  // Build AI generator if API key is configured
  let ai: AiGenerator | undefined;
  const anthropicKey = await getApiKey("anthropic");
  if (anthropicKey) {
    // Dynamic import to avoid hard dependency on cms-ai for type resolution
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
    scopes: auth.scopes,
    actor: auth.label,
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
