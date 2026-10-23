import fs from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "./site-paths";
import { getServerTSafe } from "@/i18n/server";

export interface AIPromptDef {
  id: string;
  label: string;
  description: string;
  value: string;
}

/** Default prompts — used as fallback when no custom value is stored. label/description are i18n keys. */
export const DEFAULT_PROMPTS: Record<string, { label: string; description: string; default: string }> = {
  "chat.system": {
    label: "libText.aiPrompts.chatSystem.label",
    description: "libText.aiPrompts.chatSystem.description",
    // i18n-ignore: model prompt sent to the AI, editable in settings
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
    label: "libText.aiPrompts.generateSystem.label",
    description: "libText.aiPrompts.generateSystem.description",
    // i18n-ignore: model prompt sent to the AI, editable in settings
    default: `You are a professional content writer. Generate publication-ready content.{brandVoice}

## Output format
{schemaInstructions}`,
  },
  "rewrite.system": {
    label: "libText.aiPrompts.rewriteSystem.label",
    description: "libText.aiPrompts.rewriteSystem.description",
    // i18n-ignore: model prompt sent to the AI, editable in settings
    default: "You are a professional content editor. Rewrite the provided text according to the instruction. Return ONLY the rewritten text — no explanation, no quotes, no preamble.",
  },
  "agent-runner.schema": {
    label: "libText.aiPrompts.agentRunnerSchema.label",
    description: "libText.aiPrompts.agentRunnerSchema.description",
    // i18n-ignore: model prompt sent to the AI, editable in settings
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
    label: "libText.aiPrompts.agentGeneratePrompt.label",
    description: "libText.aiPrompts.agentGeneratePrompt.description",
    // i18n-ignore: model prompt sent to the AI, editable in settings
    default: "You are a CMS configuration assistant. Generate a concise, professional system prompt for an AI content agent. The prompt should define the agent's role, tone, constraints, and output format. Write in English. Return only the system prompt text — no explanations or markdown.",
  },
  "agent-create-from-description": {
    label: "libText.aiPrompts.agentCreateFromDescription.label",
    description: "libText.aiPrompts.agentCreateFromDescription.description",
    // i18n-ignore: model prompt sent to the AI, editable in settings
    default: `You are an AI agent configurator for a headless CMS. Given a natural language description of a desired content agent, return a single valid JSON object — no markdown, no explanation, no code fences.`,
  },
  "interactives.generate": {
    label: "libText.aiPrompts.interactivesGenerate.label",
    description: "libText.aiPrompts.interactivesGenerate.description",
    // i18n-ignore: model prompt sent to the AI, editable in settings
    default: `Generate a standalone HTML file with inline CSS and JavaScript.
The HTML should be a complete, self-contained interactive component.
Include <!DOCTYPE html>, <html>, <head>, <body> tags.
Use modern CSS (flexbox/grid), vanilla JS or Chart.js via CDN if charts are needed.
Make it visually polished with smooth animations and good UX.
CRITICAL: All interactive elements MUST actually work. If there are sliders, they must update values. If there are buttons, they must do something. If there are calculations, they must compute correctly. Never create non-functional UI.
CRITICAL: Output the COMPLETE HTML document. Never truncate or abbreviate.
CRITICAL: Dollar signs in JavaScript strings MUST be preserved literally. Write '$' + value, NOT template literals with backtick-dollar. The $ character is a normal string character, not a special token.
Wrap your response in \`\`\`html code fences.`,
  },
  "interactives.edit": {
    label: "libText.aiPrompts.interactivesEdit.label",
    description: "libText.aiPrompts.interactivesEdit.description",
    // i18n-ignore: model prompt sent to the AI, editable in settings
    default: `You are an expert web developer editing an interactive HTML component.
The component is called "{title}" (ID: {interactiveId}).
When the user asks you to modify the component, respond with the COMPLETE updated HTML.
CRITICAL: You MUST output the ENTIRE HTML document from <!DOCTYPE html> to </html>. Never truncate, abbreviate, or use comments like '... rest of code ...' or '/* same as before */'. Every single line must be included.
CRITICAL: Dollar signs in JavaScript strings MUST be preserved literally. Write '$' + value, NOT template literals with backtick-dollar. The $ character is a normal string character, not a special token.
Wrap your HTML output in \`\`\`html code fences so it can be extracted.
If the user asks a question (not a modification), answer concisely without code.
The component is a standalone HTML document with inline <style> and <script> tags.
You may use any web technology: CSS animations, Canvas, SVG, Chart.js (via CDN), D3, GSAP, etc.
Always produce clean, well-structured, COMPLETE and WORKING HTML with good UX.`,
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
  const t = await getServerTSafe();
  return Object.entries(DEFAULT_PROMPTS).map(([id, def]) => ({
    id,
    label: t(def.label),
    description: t(def.description),
    value: custom[id] ?? def.default,
  }));
}
