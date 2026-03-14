import fs from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "./site-paths";

export interface McpApiKey {
  key: string;
  label: string;
  scopes: string[];
}

export interface McpConfig {
  keys: McpApiKey[];
}

export interface McpApiKeyMasked {
  id: string;        // first 8 chars — used as stable UI key
  label: string;
  scopes: string[];
  masked: string;    // e.g. "abc12345…ef12"
}

export interface McpConfigMasked {
  keys: McpApiKeyMasked[];
}

async function getConfigPath(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  return path.join(dataDir, "mcp-config.json");
}

export async function readMcpConfig(): Promise<McpConfig> {
  const filePath = await getConfigPath();
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as McpConfig;
  } catch {
    return { keys: [] };
  }
}

export async function writeMcpConfig(config: McpConfig): Promise<void> {
  const filePath = await getConfigPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(config, null, 2));
}

function maskKey(key: string): string {
  if (key.length < 12) return key;
  return key.slice(0, 8) + "…" + key.slice(-4);
}

export function maskMcpConfig(config: McpConfig): McpConfigMasked {
  return {
    keys: config.keys.map((k) => ({
      id: k.key.slice(0, 8),
      label: k.label,
      scopes: k.scopes,
      masked: maskKey(k.key),
    })),
  };
}

/** Returns all key configs — for use by the MCP admin route */
export async function getMcpApiKeys(): Promise<McpApiKey[]> {
  // 1. Try _data/mcp-config.json
  try {
    const config = await readMcpConfig();
    if (config.keys.length > 0) return config.keys;
  } catch {
    // fall through
  }

  // 2. Fall back to env vars (MCP_API_KEY_1..5 or MCP_API_KEY)
  const keys: McpApiKey[] = [];
  for (let i = 1; i <= 5; i++) {
    const key = process.env[`MCP_API_KEY_${i}`];
    const label = process.env[`MCP_API_KEY_${i}_LABEL`] ?? `Key ${i}`;
    const scopes = (process.env[`MCP_API_KEY_${i}_SCOPES`] ?? "read,write,publish,deploy,ai")
      .split(",")
      .map((s) => s.trim());
    if (key) keys.push({ key, label, scopes });
  }
  const single = process.env.MCP_API_KEY;
  if (single && keys.length === 0) {
    keys.push({ key: single, label: "Default", scopes: ["read", "write", "publish", "deploy", "ai"] });
  }
  return keys;
}
