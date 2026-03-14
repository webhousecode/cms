import fs from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "./site-paths";

export interface AIPromptDef {
  id: string;
  label: string;
  description: string;
  value: string;
}

/** Default prompts — used as fallback when no custom value is stored */
export const DEFAULT_PROMPTS: Record<string, { label: string; description: string; default: string }> = {
  "chat.system": {
    label: "AI Chat — System Prompt",
    description: "System prompt for the in-editor AI Assistant chat. Variables: {collectionName}, {fieldDescriptions}",
    default: `You are a content writer inside a CMS. {collectionName}
{fieldDescriptions}

ABSOLUTE RULES — violating any of these makes your output useless:
1. Output ONLY the final content. Nothing else. No preamble, no explanation, no commentary, no suggestions.
2. NEVER output "---", "**Field:**", "# Heading", or any metadata/labels/dividers.
3. NEVER add notes like "Here is...", "The content below...", "Feel free to adjust...".
4. Start your response with the FIRST WORD of the actual content.
5. End your response with the LAST WORD of the actual content.
6. Use Markdown for formatting. Use "- " for bullet lists. Never use ">" for lists.`,
  },
  "generate.system": {
    label: "Generate Article — System Prompt",
    description: "System prompt for full-article generation from collection list or editor. Variables: {brandVoice}, {schemaInstructions}",
    default: `You are a professional content writer. Generate publication-ready content.{brandVoice}

## Output format
{schemaInstructions}`,
  },
  "rewrite.system": {
    label: "Rewrite — System Prompt",
    description: "System prompt for the inline rewrite feature (bubble menu).",
    default: "You are a professional content editor. Rewrite the provided text according to the instruction. Return ONLY the rewritten text — no explanation, no quotes, no preamble.",
  },
  "agent-runner.schema": {
    label: "Agent Runner — Schema Instructions",
    description: "Appended to every agent run. Tells the LLM how to format JSON output. Variables: {fieldList}",
    default: `Respond with ONLY a valid JSON object. No markdown fences, no explanation. Use this exact shape:
{
{fieldList}
}
- "content" / "body" fields: use Markdown with headings, paragraphs, lists. Use "- " for bullet lists. NEVER use "> " blockquotes for list items — blockquotes are ONLY for actual quotations from a person or source.
- "date": ISO date string (YYYY-MM-DD), use today's date
- "tags": array of lowercase strings
- For select fields: use ONLY the exact values listed — never invent new values
- Omit fields you have no meaningful value for`,
  },
  "agent-generate-prompt": {
    label: "Agent — Auto-Generate System Prompt",
    description: "Prompt used to auto-generate an agent's system prompt from role + name.",
    default: "You are a CMS configuration assistant. Generate a concise, professional system prompt for an AI content agent. The prompt should define the agent's role, tone, constraints, and output format. Write in English. Return only the system prompt text — no explanations or markdown.",
  },
  "agent-create-from-description": {
    label: "Agent — Create from Description",
    description: "System prompt for generating a full agent config from a natural language description.",
    default: `You are an AI agent configurator for a headless CMS. Given a natural language description of a desired content agent, return a single valid JSON object — no markdown, no explanation, no code fences.`,
  },
};

async function getPromptsPath(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  return path.join(dataDir, "ai-prompts.json");
}

export async function readPrompts(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(await getPromptsPath(), "utf-8");
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function writePrompts(prompts: Record<string, string>): Promise<void> {
  const filePath = await getPromptsPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(prompts, null, 2));
}

/** Get a single prompt value — custom if stored, otherwise default */
export async function getPrompt(id: string): Promise<string> {
  const custom = await readPrompts();
  if (custom[id]) return custom[id];
  return DEFAULT_PROMPTS[id]?.default ?? "";
}

/** Get all prompts with current values for the UI */
export async function getAllPrompts(): Promise<AIPromptDef[]> {
  const custom = await readPrompts();
  return Object.entries(DEFAULT_PROMPTS).map(([id, def]) => ({
    id,
    label: def.label,
    description: def.description,
    value: custom[id] ?? def.default,
  }));
}
