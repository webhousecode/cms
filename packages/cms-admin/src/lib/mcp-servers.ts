import fs from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "./site-paths";

/** Configuration for an external MCP server that agents can connect to */
export interface McpServerDef {
  id: string;
  name: string;
  /** Executable command, e.g. "npx" or "node" */
  command: string;
  /** Arguments, e.g. ["-y", "@anthropic/mcp-brave-search"] */
  args: string[];
  /** Environment variables passed to the subprocess */
  env?: Record<string, string>;
  enabled: boolean;
}

async function getConfigPath(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  return path.join(dataDir, "mcp-servers.json");
}

export async function listMcpServers(): Promise<McpServerDef[]> {
  try {
    const raw = await fs.readFile(await getConfigPath(), "utf-8");
    return JSON.parse(raw) as McpServerDef[];
  } catch {
    return [];
  }
}

export async function saveMcpServers(servers: McpServerDef[]): Promise<void> {
  const filePath = await getConfigPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(servers, null, 2));
}

export async function addMcpServer(server: Omit<McpServerDef, "id">): Promise<McpServerDef> {
  const servers = await listMcpServers();
  const config: McpServerDef = {
    ...server,
    id: `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  };
  servers.push(config);
  await saveMcpServers(servers);
  return config;
}

export async function updateMcpServer(id: string, patch: Partial<McpServerDef>): Promise<McpServerDef> {
  const servers = await listMcpServers();
  const idx = servers.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error(`MCP server ${id} not found`);
  servers[idx] = { ...servers[idx], ...patch, id };
  await saveMcpServers(servers);
  return servers[idx];
}

export async function deleteMcpServer(id: string): Promise<void> {
  const servers = await listMcpServers();
  await saveMcpServers(servers.filter((s) => s.id !== id));
}
