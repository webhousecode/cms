import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { PUBLIC_TOOLS } from "./tools.js";
import { ContentReader } from "./reader.js";
import type { ContentService, CmsConfig } from "@webhouse/cms";

export function createPublicMcpServer(
  content: ContentService,
  config: CmsConfig,
): Server {
  const reader = new ContentReader(content, config);

  const server = new Server(
    { name: "cms-public", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: PUBLIC_TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    const a = args as Record<string, unknown>;

    try {
      let result: unknown;

      switch (name) {
        case "get_site_summary":
          result = await reader.getSiteSummary();
          break;
        case "list_collection": {
          const listArgs: Parameters<typeof reader.listCollection>[0] = {
            collection: String(a["collection"] ?? ""),
          };
          if (a["limit"] !== undefined) listArgs.limit = a["limit"] as number;
          if (a["offset"] !== undefined) listArgs.offset = a["offset"] as number;
          if (a["sort"] !== undefined) listArgs.sort = a["sort"] as "date_desc" | "date_asc" | "title_asc";
          result = await reader.listCollection(listArgs);
          break;
        }
        case "search_content": {
          const searchArgs: Parameters<typeof reader.search>[0] = {
            query: String(a["query"] ?? ""),
          };
          if (a["collection"] !== undefined) searchArgs.collection = a["collection"] as string;
          if (a["limit"] !== undefined) searchArgs.limit = a["limit"] as number;
          result = await reader.search(searchArgs);
          break;
        }
        case "get_page": {
          const pageArgs: Parameters<typeof reader.getPage>[0] = {
            slug: String(a["slug"] ?? ""),
          };
          if (a["collection"] !== undefined) pageArgs.collection = a["collection"] as string;
          result = await reader.getPage(pageArgs);
          break;
        }
        case "get_schema":
          result = await reader.getSchema(String(a["collection"] ?? ""));
          break;
        case "export_all": {
          const exportArgs: Parameters<typeof reader.exportAll>[0] = {};
          if (a["include_body"] !== undefined) exportArgs.include_body = a["include_body"] as boolean;
          result = await reader.exportAll(exportArgs);
          break;
        }
        default:
          return { content: [{ type: "text" as const, text: `Unknown tool: ${name}` }], isError: true };
      }

      const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
      return { content: [{ type: "text" as const, text }] };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  });

  return server;
}
