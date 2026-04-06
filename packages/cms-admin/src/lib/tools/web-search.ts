import { getWebSearchKey } from "@/lib/ai-config";
import type { ToolDefinition, ToolHandler } from "./index";

interface ToolPair {
  definition: ToolDefinition;
  handler: ToolHandler;
}

async function searchBrave(apiKey: string, query: string, count: number): Promise<string> {
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`,
    { headers: { "X-Subscription-Token": apiKey, Accept: "application/json" } }
  );
  if (!res.ok) return `Web search failed: HTTP ${res.status}`;
  const data = (await res.json()) as {
    web?: { results?: { title: string; url: string; description: string }[] };
  };
  const results = data.web?.results ?? [];
  if (results.length === 0) return "No web results found.";
  return results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description}`).join("\n\n");
}

async function searchTavily(apiKey: string, query: string, count: number): Promise<string> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, query, max_results: count }),
  });
  if (!res.ok) return `Web search failed: HTTP ${res.status}`;
  const data = (await res.json()) as {
    results?: { title: string; url: string; content: string }[];
  };
  const results = data.results ?? [];
  if (results.length === 0) return "No web results found.";
  return results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content}`).join("\n\n");
}

/**
 * Web search tool — supports Brave and Tavily providers.
 * Configured in Settings → AI (webSearchProvider + webSearchApiKey).
 */
export async function buildWebSearchTool(): Promise<ToolPair | null> {
  const config = await getWebSearchKey();

  if (!config) {
    // Not configured — return null so buildToolRegistry skips it.
    // Previously returned a dummy tool which the agent could still call,
    // wasting tokens on an error message.
    return null;
  }

  return {
    definition: {
      name: "web_search",
      description: "Search the web for current information, facts, statistics, and recent events.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          count: { type: "number", description: "Number of results (default 5, max 10)" },
        },
        required: ["query"],
      },
    },
    handler: async (input) => {
      const query = String(input.query ?? "");
      const count = Math.min(Number(input.count ?? 5), 10);
      try {
        if (config.provider === "tavily") {
          return await searchTavily(config.key, query, count);
        }
        return await searchBrave(config.key, query, count);
      } catch (err) {
        return `Web search error: ${err instanceof Error ? err.message : "unknown"}`;
      }
    },
  };
}
