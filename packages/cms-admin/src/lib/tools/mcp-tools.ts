import { listMcpServers } from "@/lib/mcp-servers";
import { connectMcpServer, listMcpTools, disconnectMcpServer, type McpConnection } from "@/lib/mcp-client";
import type { ToolDefinition, ToolHandler } from "./index";

interface ToolPair {
  definition: ToolDefinition;
  handler: ToolHandler;
}

/** Active MCP connections for the current agent run — must be cleaned up after */
const activeConnections: McpConnection[] = [];

/**
 * Connect to all enabled external MCP servers and collect their tools.
 * Call `disconnectAllMcpServers()` after the agent run completes.
 */
export async function buildMcpTools(): Promise<ToolPair[]> {
  const servers = await listMcpServers();
  const enabled = servers.filter((s) => s.enabled);

  if (enabled.length === 0) return [];

  const tools: ToolPair[] = [];

  for (const server of enabled) {
    try {
      console.log(`[mcp] Connecting to ${server.name} (${server.command} ${server.args.join(" ")})…`);
      const connection = await connectMcpServer(server);
      activeConnections.push(connection);

      const serverTools = await listMcpTools(connection);
      tools.push(...serverTools);
      console.log(`[mcp] ${server.name}: ${serverTools.length} tools available`);
    } catch (err) {
      console.error(`[mcp] Failed to connect to ${server.name}:`, err instanceof Error ? err.message : err);
    }
  }

  return tools;
}

/** Disconnect all active MCP server connections. Call after agent run. */
export async function disconnectAllMcpServers(): Promise<void> {
  for (const conn of activeConnections) {
    try {
      await disconnectMcpServer(conn);
    } catch {
      // Already dead
    }
  }
  activeConnections.length = 0;
}
