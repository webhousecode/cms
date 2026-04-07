/**
 * AI image generation via Google Gemini 2.5 Flash Image (Nano Banana).
 *
 * Calls the Google Generative Language REST API directly so we don't
 * get pinned to a specific @ai-sdk/google version that may or may not
 * expose Gemini's multimodal image output. Returns raw bytes + mime
 * type so the caller can pipe them through the existing media
 * processing pipeline (Sharp variants, EXIF, F44 vision analysis).
 *
 * Pricing as of 2026-04: $0.039 per image. Recorded against the
 * cockpit budget by callers via cockpit.addCost().
 */
import { readAiConfig } from "@/lib/ai-config";

/** Pricing snapshot — keep in sync with Google's published rate. */
export const NANO_BANANA_COST_PER_IMAGE_USD = 0.039;

// "Nano Banana 2" — Gemini 3 Pro Image. Verified live against the
// Generative Language API on 2026-04-07. The previous "preview" suffix
// on the 2.5 model is dead; the live IDs are gemini-2.5-flash-image
// (stable, larger PNGs ~1.4MB) and gemini-3-pro-image-preview (newer,
// smaller JPEGs ~550kb, better quality). We default to Nano Banana 2.
const MODEL_ID = "gemini-3-pro-image-preview";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`;

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
 * Generate an image from a text prompt using Gemini 2.5 Flash Image
 * (Nano Banana). Optionally accepts a reference image (e.g. for
 * style/content editing).
 */
export async function generateImage(params: {
  prompt: string;
  /** Optional input image to edit / use as reference. */
  referenceImage?: { buffer: Buffer; mimeType: string };
  /** For dependency injection in tests. */
  fetchImpl?: typeof fetch;
}): Promise<GeneratedImage> {
  const { prompt, referenceImage, fetchImpl = fetch } = params;

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

  // Build the request: text prompt, optional reference image as second part.
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (referenceImage) {
    parts.push({
      inlineData: {
        mimeType: referenceImage.mimeType,
        data: referenceImage.buffer.toString("base64"),
      },
    });
  }

  const res = await fetchImpl(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      // Gemini's multimodal image model can return text + image; ask for both.
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini image generation failed: HTTP ${res.status} ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          inlineData?: { mimeType?: string; data?: string };
          // Camel-cased alias seen on some responses
          inline_data?: { mime_type?: string; data?: string };
        }>;
      };
    }>;
    promptFeedback?: { blockReason?: string };
  };

  if (data.promptFeedback?.blockReason) {
    throw new Error(`Image prompt blocked: ${data.promptFeedback.blockReason}`);
  }

  const partsOut = data.candidates?.[0]?.content?.parts ?? [];
  for (const part of partsOut) {
    const camel = part.inlineData;
    const snake = part.inline_data;
    const mime = camel?.mimeType ?? snake?.mime_type;
    const b64 = camel?.data ?? snake?.data;
    if (mime && b64) {
      return {
        buffer: Buffer.from(b64, "base64"),
        mimeType: mime,
        provider: MODEL_ID,
        costUsd: NANO_BANANA_COST_PER_IMAGE_USD,
      };
    }
  }

  throw new Error("Gemini did not return an image (response contained no inline image data)");
}
