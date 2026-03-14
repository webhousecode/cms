import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { McpServerDef } from "./mcp-servers";
import type { ToolDefinition, ToolHandler } from "./tools";

export interface McpConnection {
  client: Client;
  transport: StdioClientTransport;
  serverId: string;
  serverName: string;
}

/**
 * Connect to an external MCP server via stdio transport.
 * Spawns the server as a child process.
 */
export async function connectMcpServer(config: McpServerDef): Promise<McpConnection> {
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: { ...process.env, ...(config.env ?? {}) } as Record<string, string>,
  });

  const client = new Client(
    { name: `cms-agent-${config.id}`, version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);

  return { client, transport, serverId: config.id, serverName: config.name };
}

/**
 * List tools available on a connected MCP server.
 * Converts them to our ToolDefinition format (compatible with Anthropic tool_use).
 */
export async function listMcpTools(connection: McpConnection): Promise<{ definition: ToolDefinition; handler: ToolHandler }[]> {
  const result = await connection.client.listTools();

  return (result.tools ?? []).map((tool) => ({
    definition: {
      name: `mcp_${connection.serverId}_${tool.name}`,
      description: `[${connection.serverName}] ${tool.description ?? tool.name}`,
      input_schema: (tool.inputSchema ?? { type: "object", properties: {} }) as Record<string, unknown>,
    },
    handler: async (input: Record<string, unknown>) => {
      const callResult = await connection.client.callTool({
        name: tool.name,
        arguments: input,
      });
      // MCP tool results can be text or other content types
      if (Array.isArray(callResult.content)) {
        return callResult.content
          .map((c) => {
            if (typeof c === "object" && c !== null && "text" in c) {
              return String((c as { text: string }).text);
            }
            return JSON.stringify(c);
          })
          .join("\n");
      }
      return String(callResult.content ?? "");
    },
  }));
}

/**
 * Disconnect from an MCP server — cleans up the subprocess.
 */
export async function disconnectMcpServer(connection: McpConnection): Promise<void> {
  try {
    await connection.client.close();
  } catch {
    // Subprocess may already be dead
  }
}
