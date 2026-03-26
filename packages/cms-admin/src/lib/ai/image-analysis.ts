/**
 * F103 — AI Image Analysis (Caption, Alt-text & Tags)
 *
 * Uses Google Gemini 2.0 Flash via Vercel AI SDK for vision-based
 * image analysis. Returns structured caption, alt-text, and tags.
 *
 * API key comes from existing ai-config.json (geminiApiKey field)
 * or GOOGLE_GENERATIVE_AI_API_KEY / GEMINI_API_KEY env vars.
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { getApiKey } from "@/lib/ai-config";

export const imageAnalysisSchema = z.object({
  caption: z.string().describe("A descriptive sentence about the image content"),
  alt: z.string().max(125).describe("Accessible alt-text, max 125 characters"),
  tags: z.array(z.string()).min(1).max(10).describe("Relevant keywords/tags"),
});

export type ImageAnalysis = z.infer<typeof imageAnalysisSchema>;

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

async function getGeminiApiKey(): Promise<string> {
  // 1. Check ai-config.json (existing CMS config)
  const configKey = await getApiKey("gemini");
  if (configKey) return configKey;

  // 2. Check env vars (Vercel AI SDK convention)
  const envKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
  if (envKey) return envKey;

  throw new Error("Gemini API key not configured. Go to Settings → AI to add your key.");
}

export async function analyzeImage(
  imageBuffer: Buffer,
  mimeType: string,
  language: string = "da",
): Promise<ImageAnalysis> {
  const apiKey = await getGeminiApiKey();
  const google = createGoogleGenerativeAI({ apiKey });
  const model = google("gemini-2.0-flash");

  const { object } = await generateObject({
    model,
    schema: imageAnalysisSchema,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: getAnalysisPrompt(language) },
        {
          type: "image",
          image: imageBuffer,
        },
      ],
    }],
  });

  return object;
}

/** Quick test that the API key works — sends a tiny test and checks response */
export async function testGeminiConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const apiKey = await getGeminiApiKey();
    const google = createGoogleGenerativeAI({ apiKey });
    const model = google("gemini-2.0-flash");

    // Simple text-only test to verify key
    const { object } = await generateObject({
      model,
      schema: z.object({ status: z.string() }),
      prompt: "Return status: ok",
    });

    return { ok: object.status === "ok" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("401") || msg.includes("UNAUTHENTICATED")) {
      return { ok: false, error: "Invalid API key" };
    }
    if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
      return { ok: false, error: "Rate limit reached (1,500/day). Try again tomorrow." };
    }
    return { ok: false, error: msg.slice(0, 200) };
  }
}
