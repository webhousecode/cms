/**
 * AI image generation via Black Forest Labs FLUX 2 on the EU route
 * (api.eu.bfl.ai), through the central @broberg/ai-sdk facade (ai.image,
 * bfl provider, prompt-only since 0.49.2). Returns raw bytes + mime type so
 * the caller can pipe them through the existing media processing pipeline
 * (Sharp variants, EXIF, F44 vision analysis).
 *
 * F201.7: this replaced Gemini (Nano Banana), which ran in the US. There is
 * deliberately NO fallback to another provider — a fallback is a route, and a
 * US route would take the call out of the EU without any error. No key means
 * the tool stays off (ship dark).
 */
import { getAI } from "@/lib/ai/client";

/** FLUX 2 pro — the SDK's price/quality default for plain text-to-image. */
const MODEL_ID = "flux-2-pro";

export interface GeneratedImage {
  /** Raw image bytes. */
  buffer: Buffer;
  /** MIME type of the downloaded image, e.g. "image/jpeg". */
  mimeType: string;
  /** Provider model name for audit trail. */
  provider: string;
  /** Cost in USD as reported by BFL (via the SDK's usage stamp). */
  costUsd: number;
}

/** The BFL key, or null when image generation is not set up for this instance. */
export function getImageGenerationKey(): string | null {
  return process.env.BFL_API_KEY || null;
}

/** Generate an image from a text prompt on the EU route. */
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
  if (!getImageGenerationKey()) {
    throw new Error("Image generation is not set up: BFL_API_KEY is missing.");
  }

  const ai = await getAI();
  const { url, usage } = await ai.image({
    prompt,
    override: { provider: "bfl", model: MODEL_ID, transport: "http" },
    purpose: "media.image-generation",
  });

  // Residency is read off the RESPONSE — the route that actually answered —
  // never assumed from the request.
  if (usage.region !== "eu") {
    throw new Error(`Image generation answered outside the EU (provider ${usage.provider}, region ${usage.region}); refused.`);
  }

  // BFL returns a short-lived delivery URL, not inline bytes.
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image download failed: ${res.status}`);
  const mimeType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!mimeType.startsWith("image/")) throw new Error(`Image download was not an image (${mimeType || "no content-type"})`);

  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    mimeType,
    provider: MODEL_ID,
    costUsd: usage.costUsd,
  };
}
