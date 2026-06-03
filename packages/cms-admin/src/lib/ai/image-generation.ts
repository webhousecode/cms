/**
 * AI image generation via Google Gemini (Nano Banana), routed through the
 * central @broberg/ai-sdk facade (ai.image, gemini provider — F013). Returns
 * raw bytes + mime type so the caller can pipe them through the existing media
 * processing pipeline (Sharp variants, EXIF, F44 vision analysis).
 *
 * Pricing as of 2026-04: $0.039 per image. The SDK stamps the real cost on
 * usage.costUsd and forwards it to the cost sink; the exported constant remains
 * for callers that report it against the cockpit budget via cockpit.addCost().
 */
import { readAiConfig } from "@/lib/ai-config";
import { getAI } from "@/lib/ai/client";

/** Pricing snapshot — keep in sync with Google's published rate. */
export const NANO_BANANA_COST_PER_IMAGE_USD = 0.039;

// "Nano Banana 2" — Gemini 3 Pro Image (newer, smaller JPEGs, better quality).
const MODEL_ID = "gemini-3-pro-image-preview";

export interface GeneratedImage {
  /** Raw image bytes (typically PNG). */
  buffer: Buffer;
  /** MIME type as reported by Gemini, e.g. "image/png". */
  mimeType: string;
  /** Provider model name for audit trail. */
  provider: string;
  /** Cost in USD that was incurred for this generation. */
  costUsd: number;
}

/**
 * Resolve the Google Generative AI API key. Mirrors image-analysis.ts:
 * config.geminiApiKey → GOOGLE_GENERATIVE_AI_API_KEY → GEMINI_API_KEY.
 * Returns null if no key is available so callers can degrade gracefully.
 */
export async function getGeminiImageKey(): Promise<string | null> {
  const config = await readAiConfig();
  return (
    config.geminiApiKey ??
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
    process.env.GEMINI_API_KEY ??
    null
  );
}

/**
 * Generate an image from a text prompt using Gemini (Nano Banana) via
 * `ai.image()`. The gemini adapter returns the image inline as a
 * `data:<mime>;base64,…` URL, which we decode back to raw bytes for the media
 * pipeline.
 */
export async function generateImage(params: {
  prompt: string;
}): Promise<GeneratedImage> {
  const { prompt } = params;

  if (!prompt || !prompt.trim()) {
    throw new Error("Image generation prompt is required");
  }
  if (prompt.length > 4000) {
    throw new Error("Image generation prompt is too long (max 4000 characters)");
  }

  const key = await getGeminiImageKey();
  if (!key) {
    throw new Error(
      "No Google Gemini API key configured. Add a key in Settings → AI or on the Examples org settings.",
    );
  }

  const ai = await getAI();
  const { url, usage } = await ai.image({
    prompt,
    override: { provider: "gemini", model: MODEL_ID, transport: "http" },
    purpose: "media.image-generation",
  });

  // F013 returns a data:<mime>;base64,… URL (Gemini gives inline bytes, not a
  // hosted URL). Decode back to raw bytes + mime for the Sharp/EXIF pipeline.
  const comma = url.indexOf(",");
  const semi = url.indexOf(";");
  if (!url.startsWith("data:") || comma < 0 || semi < 0) {
    throw new Error("Gemini did not return an inline image (unexpected ai.image url shape)");
  }
  const mimeType = url.slice(5, semi);
  const buffer = Buffer.from(url.slice(comma + 1), "base64");

  return {
    buffer,
    mimeType,
    provider: MODEL_ID,
    costUsd: usage.costUsd || NANO_BANANA_COST_PER_IMAGE_USD,
  };
}
