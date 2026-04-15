/**
 * F103 — AI Image Analysis (Caption, Alt-text & Tags)
 *
 * Provider-agnostic image analysis via Vercel AI SDK.
 * Uses whichever provider has an API key configured:
 *   1. Anthropic (Claude) — best vision, already configured for most CMS installs
 *   2. Google Gemini — fallback if no Anthropic key
 *
 * API keys come from existing ai-config.json or env vars.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { readAiConfig } from "@/lib/ai-config";

export const imageAnalysisSchema = z.object({
  caption: z.string().describe("A descriptive sentence about the image content"),
  alt: z.string().max(125).describe("Accessible alt-text, max 125 characters"),
  tags: z.array(z.string()).min(1).max(10).describe("Relevant keywords/tags"),
});

export type ImageAnalysis = z.infer<typeof imageAnalysisSchema>;

/** Multi-locale analysis: caption + alt per locale, tags universal */
export interface MultiLocaleImageAnalysis {
  captions: Record<string, string>;
  alts: Record<string, string>;
  tags: string[];
  provider: string;
}

function getAnalysisPrompt(language: string = "da"): string {
  const langMap: Record<string, string> = {
    da: "Svar på dansk.",
    en: "Respond in English.",
    de: "Antworte auf Deutsch.",
    sv: "Svara på svenska.",
    no: "Svar på norsk.",
  };
  return `You are an image analyst for a CMS media library.
Analyze the image and return structured data.

Rules:
- caption: One natural sentence describing what the image shows. Be specific.
- alt: Short, accessible description for screen readers. Max 125 characters.
- tags: 3-8 relevant keywords. Use single words or short phrases.
  Include: subject, style, colors, mood, context.
- Do not use generic tags like "image" or "photo".
${langMap[language] ?? langMap.en}`;
}

/** Resolve the best available vision model from configured API keys */
async function getVisionModel(): Promise<{ model: Parameters<typeof generateObject>[0]["model"]; provider: string }> {
  const config = await readAiConfig();

  // 1. Anthropic — best vision quality, reliable structured output
  const anthropicKey = config.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const anthropic = createAnthropic({ apiKey: anthropicKey });
    return { model: anthropic("claude-sonnet-4-20250514"), provider: "claude-sonnet-4-20250514" };
  }

  // 2. Google Gemini — fallback (free tier but less reliable structured output)
  const geminiKey = config.geminiApiKey ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
    const google = createGoogleGenerativeAI({ apiKey: geminiKey });
    return { model: google("gemini-2.5-flash") as Parameters<typeof generateObject>[0]["model"], provider: "gemini-2.5-flash" };
  }

  throw new Error("No AI API key configured. Add an Anthropic or Gemini key in Cockpit → Settings.");
}

export async function analyzeImage(
  imageBuffer: Buffer,
  mimeType: string,
  language: string = "da",
): Promise<ImageAnalysis & { provider: string }> {
  const { model, provider } = await getVisionModel();

  const { object } = await generateObject({
    model,
    schema: imageAnalysisSchema,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: getAnalysisPrompt(language) },
        { type: "image", image: imageBuffer },
      ],
    }],
  });

  return { ...object, provider };
}

/**
 * Analyze image for multiple locales in one API call.
 * Returns caption + alt per locale, tags are universal.
 */
export async function analyzeImageMultiLocale(
  imageBuffer: Buffer,
  mimeType: string,
  locales: string[],
): Promise<MultiLocaleImageAnalysis> {
  if (locales.length === 0) locales = ["en"];

  // For single locale, use the standard function and wrap
  if (locales.length === 1) {
    const result = await analyzeImage(imageBuffer, mimeType, locales[0]);
    return {
      captions: { [locales[0]]: result.caption },
      alts: { [locales[0]]: result.alt },
      tags: result.tags,
      provider: result.provider,
    };
  }

  const { model, provider } = await getVisionModel();

  const langMap: Record<string, string> = {
    da: "Dansk", en: "English", de: "Deutsch", sv: "Svenska",
    no: "Norsk", fr: "Français", es: "Español", nl: "Nederlands",
    fi: "Suomi", it: "Italiano", pt: "Português", pl: "Polski",
    ja: "日本語", zh: "中文", ko: "한국어",
  };

  const localeList = locales.map((l) => `${l} (${langMap[l] ?? l})`).join(", ");

  // Build dynamic zod schema for per-locale fields
  const captionsShape: Record<string, z.ZodString> = {};
  const altsShape: Record<string, z.ZodString> = {};
  for (const l of locales) {
    captionsShape[l] = z.string().describe(`Caption in ${langMap[l] ?? l}`);
    altsShape[l] = z.string().describe(`Alt-text in ${langMap[l] ?? l}, max 125 chars`);
  }

  const multiSchema = z.object({
    captions: z.object(captionsShape).describe("Image caption per locale"),
    alts: z.object(altsShape).describe("Accessible alt-text per locale (max 125 chars each)"),
    tags: z.array(z.string()).min(1).max(10).describe("Universal keywords/tags (language-neutral or English)"),
  });

  const prompt = `You are an image analyst for a CMS media library.
Analyze the image and return structured data in multiple languages: ${localeList}.

Rules:
- captions: One natural sentence per locale describing what the image shows. Be specific. Each caption in its respective language.
- alts: Short, accessible description per locale for screen readers. Max 125 characters each. Each alt in its respective language.
- tags: 3-8 relevant keywords. Use English or language-neutral terms. Include: subject, style, colors, mood, context.
- Do not use generic tags like "image" or "photo".`;

  const { object } = await generateObject({
    model,
    schema: multiSchema,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image", image: imageBuffer },
      ],
    }],
  });

  return {
    captions: object.captions as Record<string, string>,
    alts: object.alts as Record<string, string>,
    tags: object.tags,
    provider,
  };
}

/**
 * Analyze SVG as TEXT — SVG is XML source, not a raster image. Claude's vision
 * API doesn't accept SVG, but the XML structure (shapes, paths, text, IDs, etc.)
 * contains enough info for a useful caption/alt/tags analysis.
 *
 * Truncates very large SVGs (>50KB) since most info is in the opening structure.
 */
export async function analyzeSvgText(
  svgText: string,
  language: string = "da",
): Promise<ImageAnalysis & { provider: string }> {
  const { model, provider } = await getVisionModel();
  const src = svgText.length > 50000 ? svgText.slice(0, 50000) + "\n<!-- truncated -->" : svgText;

  const { object } = await generateObject({
    model,
    schema: imageAnalysisSchema,
    messages: [{
      role: "user",
      content: [{
        type: "text",
        text: `You are an image analyst for a CMS media library. This is an SVG file — its XML source is below. Analyze the structure (shapes, paths, text elements, viewBox, IDs, classes) to infer what the SVG depicts.

Rules:
- caption: One natural sentence describing what the SVG depicts. Be specific.
- alt: Short accessible description for screen readers. Max 125 characters.
- tags: 3-8 keywords. Include: subject, style (icon/illustration/diagram/logo/chart), dominant colors, mood.
- Do not use generic tags like "image" or "svg".
${language === "da" ? "Svar på dansk." : language === "de" ? "Antworte auf Deutsch." : language === "sv" ? "Svara på svenska." : language === "no" ? "Svar på norsk." : "Respond in English."}

SVG source:
\`\`\`xml
${src}
\`\`\``,
      }],
    }],
  });

  return { ...object, provider };
}

/** Multi-locale SVG text analysis — mirrors analyzeImageMultiLocale structure */
export async function analyzeSvgTextMultiLocale(
  svgText: string,
  locales: string[],
): Promise<MultiLocaleImageAnalysis> {
  if (locales.length === 0) locales = ["en"];

  if (locales.length === 1) {
    const result = await analyzeSvgText(svgText, locales[0]);
    return {
      captions: { [locales[0]]: result.caption },
      alts: { [locales[0]]: result.alt },
      tags: result.tags,
      provider: result.provider,
    };
  }

  const { model, provider } = await getVisionModel();
  const src = svgText.length > 50000 ? svgText.slice(0, 50000) + "\n<!-- truncated -->" : svgText;

  const langMap: Record<string, string> = {
    da: "Dansk", en: "English", de: "Deutsch", sv: "Svenska",
    no: "Norsk", fr: "Français", es: "Español", nl: "Nederlands",
    fi: "Suomi", it: "Italiano", pt: "Português", pl: "Polski",
    ja: "日本語", zh: "中文", ko: "한국어",
  };
  const localeList = locales.map((l) => `${l} (${langMap[l] ?? l})`).join(", ");

  const captionsShape: Record<string, z.ZodString> = {};
  const altsShape: Record<string, z.ZodString> = {};
  for (const l of locales) {
    captionsShape[l] = z.string().describe(`Caption in ${langMap[l] ?? l}`);
    altsShape[l] = z.string().describe(`Alt-text in ${langMap[l] ?? l}, max 125 chars`);
  }
  const multiSchema = z.object({
    captions: z.object(captionsShape),
    alts: z.object(altsShape),
    tags: z.array(z.string()).min(1).max(10),
  });

  const { object } = await generateObject({
    model,
    schema: multiSchema,
    messages: [{
      role: "user",
      content: [{
        type: "text",
        text: `You are an image analyst for a CMS media library. This is an SVG file — its XML source is below. Analyze the structure (shapes, paths, text elements, viewBox, IDs, classes) to infer what the SVG depicts.

Return captions and alts for these locales: ${localeList}.

Rules:
- captions: one natural sentence per locale describing what the SVG depicts. Each in its respective language.
- alts: short accessible description per locale, max 125 chars each.
- tags: 3-8 keywords in English. Include subject, style (icon/illustration/diagram/logo/chart), colors, mood.
- Do not use generic tags like "image" or "svg".

SVG source:
\`\`\`xml
${src}
\`\`\``,
      }],
    }],
  });

  return {
    captions: object.captions as Record<string, string>,
    alts: object.alts as Record<string, string>,
    tags: object.tags,
    provider,
  };
}

/** Quick test that the vision model works */
export async function testVisionConnection(): Promise<{ ok: boolean; provider?: string; error?: string }> {
  try {
    const { model, provider } = await getVisionModel();

    const { object } = await generateObject({
      model,
      schema: z.object({ status: z.string() }),
      prompt: "Return status: ok",
    });

    return { ok: object.status === "ok", provider };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg.slice(0, 200) };
  }
}
