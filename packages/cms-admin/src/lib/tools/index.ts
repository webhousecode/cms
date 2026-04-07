import type { AgentConfig } from "@/lib/agents";
import { buildCmsTools } from "./cms-tools";
import { buildWebSearchTool } from "./web-search";
import { buildImageGenerationTool } from "./image-generation";
import { buildMcpTools, disconnectAllMcpServers } from "./mcp-tools";

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export type ToolHandler = (input: Record<string, unknown>) => Promise<string>;

export interface ToolRegistry {
  definitions: ToolDefinition[];
  handlers: Map<string, ToolHandler>;
  /** Call after agent run to clean up MCP server connections */
  cleanup: () => Promise<void>;
}

/**
 * Build tool registry based on agent config.
 * Returns Anthropic-compatible tool definitions and handler functions.
 * IMPORTANT: Call registry.cleanup() after the agent run to disconnect MCP servers.
 */
export async function buildToolRegistry(agent: AgentConfig): Promise<ToolRegistry> {
  const definitions: ToolDefinition[] = [];
  const handlers = new Map<string, ToolHandler>();
  let hasMcp = false;

  // CMS content tools (internal database)
  if (agent.tools.internalDatabase) {
    const cmsTools = await buildCmsTools();
    for (const tool of cmsTools) {
      definitions.push(tool.definition);
      handlers.set(tool.definition.name, tool.handler);
    }
  }

  // Web search
  if (agent.tools.webSearch) {
    const webTool = await buildWebSearchTool();
    if (webTool) {
      definitions.push(webTool.definition);
      handlers.set(webTool.definition.name, webTool.handler);
    }
  }

  // Image generation (Gemini Nano Banana)
  if (agent.tools.imageGeneration) {
    const imgTool = await buildImageGenerationTool();
    if (imgTool) {
      definitions.push(imgTool.definition);
      handlers.set(imgTool.definition.name, imgTool.handler);
    }
  }

  // External MCP servers
  try {
    const mcpTools = await buildMcpTools();
    for (const tool of mcpTools) {
      definitions.push(tool.definition);
      handlers.set(tool.definition.name, tool.handler);
    }
    if (mcpTools.length > 0) hasMcp = true;
  } catch (err) {
    console.error("[tools] Failed to load MCP tools:", err instanceof Error ? err.message : err);
  }

  return {
    definitions,
    handlers,
    cleanup: hasMcp ? disconnectAllMcpServers : async () => {},
  };
}
