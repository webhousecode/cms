import fs from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "./site-paths";
import { SECRET_FIELDS, clearRedactedSecrets } from "./beam/types";

export interface AiConfig {
  defaultProvider: "anthropic" | "openai" | "gemini";
  anthropicApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  webSearchProvider?: "brave" | "tavily";
  braveApiKey?: string;
  tavilyApiKey?: string;
  /** @deprecated Use braveApiKey/tavilyApiKey instead */
  webSearchApiKey?: string;
}

export interface AiConfigMasked {
  defaultProvider: AiConfig["defaultProvider"];
  anthropicApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  webSearchProvider?: "brave" | "tavily";
  braveApiKey?: string;
  tavilyApiKey?: string;
}

async function getConfigPath(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  return path.join(dataDir, "ai-config.json");
}

export async function readAiConfig(): Promise<AiConfig> {
  const filePath = await getConfigPath();
  let stored: Partial<AiConfig> = {};
  try {
    stored = JSON.parse(await fs.readFile(filePath, "utf-8")) as Partial<AiConfig>;
  } catch { /* first read */ }

  // Defensive: drop any BEAM_REDACTED placeholders so env-var fallback applies.
  // Beam push redacts secrets to "BEAM_REDACTED" before export; if a beam was
  // imported without follow-up secret reconfiguration, those strings sit on disk
  // and will be used as real API keys unless we strip them here.
  clearRedactedSecrets(stored as Record<string, unknown>, SECRET_FIELDS["ai-config.json"]!);

  // F87: Org-level AI keys fallback
  try {
    const { readOrgSettings } = await import("./org-settings");
    const org = await readOrgSettings();
    if (Object.keys(org).length > 0) {
      // Map org field names → ai-config field names
      const orgAi: Partial<AiConfig> = {};
      if (org.aiDefaultProvider) orgAi.defaultProvider = org.aiDefaultProvider;
      if (org.aiAnthropicApiKey) orgAi.anthropicApiKey = org.aiAnthropicApiKey;
      if (org.aiOpenaiApiKey) orgAi.openaiApiKey = org.aiOpenaiApiKey;
      if (org.aiGeminiApiKey) orgAi.geminiApiKey = org.aiGeminiApiKey;
      if (org.aiWebSearchProvider) orgAi.webSearchProvider = org.aiWebSearchProvider;
      if (org.aiBraveApiKey) orgAi.braveApiKey = org.aiBraveApiKey;
      if (org.aiTavilyApiKey) orgAi.tavilyApiKey = org.aiTavilyApiKey;

      // Merge: defaults ← org ← site (empty strings in site don't override org)
      const merged: AiConfig = { defaultProvider: "anthropic", ...orgAi };
      for (const [k, v] of Object.entries(stored)) {
        if (v !== undefined && v !== null && v !== "") {
          (merged as unknown as Record<string, unknown>)[k] = v;
        }
      }
      return merged;
    }
  } catch { /* org-settings not available */ }

  return { defaultProvider: "anthropic", ...stored };
}

export async function writeAiConfig(config: AiConfig): Promise<void> {
  const filePath = await getConfigPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(config, null, 2));
}

function mask(key?: string): string | undefined {
  if (!key || key.length < 8) return key;
  return key.slice(0, 10) + "…" + key.slice(-4);
}

export function maskAiConfig(config: AiConfig): AiConfigMasked {
  // Migrate legacy webSearchApiKey → provider-specific key
  const brave = config.braveApiKey ?? (config.webSearchProvider !== "tavily" ? config.webSearchApiKey : undefined);
  const tavily = config.tavilyApiKey ?? (config.webSearchProvider === "tavily" ? config.webSearchApiKey : undefined);

  return {
    defaultProvider: config.defaultProvider,
    anthropicApiKey: mask(config.anthropicApiKey),
    openaiApiKey: mask(config.openaiApiKey),
    geminiApiKey: mask(config.geminiApiKey),
    webSearchProvider: config.webSearchProvider,
    braveApiKey: mask(brave),
    tavilyApiKey: mask(tavily),
  };
}

/** Returns the active web search API key */
export async function getWebSearchKey(): Promise<{ provider: string; key: string } | null> {
  const config = await readAiConfig();
  const provider = config.webSearchProvider ?? "brave";
  let key: string | undefined;
  if (provider === "brave") {
    key = config.braveApiKey ?? config.webSearchApiKey ?? process.env.BRAVE_API_KEY;
  } else {
    key = config.tavilyApiKey ?? config.webSearchApiKey ?? process.env.TAVILY_API_KEY;
  }
  if (!key) return null;
  return { provider, key };
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
