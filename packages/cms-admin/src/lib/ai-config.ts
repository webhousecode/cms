import fs from "fs/promises";
import path from "path";

export interface AiConfig {
  defaultProvider: "anthropic" | "openai" | "gemini";
  anthropicApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
}

export interface AiConfigMasked {
  defaultProvider: AiConfig["defaultProvider"];
  anthropicApiKey?: string;   // masked: "sk-ant-...XXXX"
  openaiApiKey?: string;
  geminiApiKey?: string;
}

function getConfigPath(): string {
  const configPath = process.env.CMS_CONFIG_PATH;
  if (!configPath) throw new Error("CMS_CONFIG_PATH not set");
  const projectDir = path.dirname(configPath);
  return path.join(projectDir, "_data", "ai-config.json");
}

export async function readAiConfig(): Promise<AiConfig> {
  const filePath = getConfigPath();
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as AiConfig;
  } catch {
    return { defaultProvider: "anthropic" };
  }
}

export async function writeAiConfig(config: AiConfig): Promise<void> {
  const filePath = getConfigPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(config, null, 2));
}

function mask(key?: string): string | undefined {
  if (!key || key.length < 8) return key;
  return key.slice(0, 10) + "…" + key.slice(-4);
}

export function maskAiConfig(config: AiConfig): AiConfigMasked {
  return {
    defaultProvider: config.defaultProvider,
    anthropicApiKey: mask(config.anthropicApiKey),
    openaiApiKey: mask(config.openaiApiKey),
    geminiApiKey: mask(config.geminiApiKey),
  };
}

/** Returns the active API key for a given provider, or null if not configured */
export async function getApiKey(provider?: string): Promise<string | null> {
  const config = await readAiConfig();
  const p = provider ?? config.defaultProvider;
  switch (p) {
    case "anthropic": return config.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY ?? null;
    case "openai":    return config.openaiApiKey ?? process.env.OPENAI_API_KEY ?? null;
    case "gemini":    return config.geminiApiKey ?? process.env.GEMINI_API_KEY ?? null;
    default:          return null;
  }
}
