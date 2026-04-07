/**
 * `generate_image` agent tool — Gemini Nano Banana wrapper.
 *
 * The agent calls this tool with a text prompt; we generate an image
 * via Gemini 2.5 Flash Image, save it through the same media pipeline
 * as user uploads (so it gets WebP variants + AI vision analysis +
 * a sidecar entry in media-meta.json), and return a Markdown
 * `![alt](url)` snippet the agent can splat directly into its
 * generated content. Every image stamped with `generatedByAi: true`
 * so the media library can filter and badge it.
 */
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { getMediaAdapter } from "@/lib/media";
import { getActiveSitePaths } from "@/lib/site-paths";
import { generateVariants, isProcessableImage } from "@/lib/media/image-processor";
import { appendMediaMeta } from "@/lib/media/media-meta";
import { analyzeImage } from "@/lib/ai/image-analysis";
import { generateImage, getGeminiImageKey, NANO_BANANA_COST_PER_IMAGE_USD } from "@/lib/ai/image-generation";
import { addCost } from "@/lib/cockpit";
import type { ToolDefinition, ToolHandler } from "./index";

interface ToolPair {
  definition: ToolDefinition;
  handler: ToolHandler;
}

const UPLOAD_BASE = process.env.UPLOAD_BASE ?? "";

/** Sanitize a free-text prompt into a short filename slug. */
function slugifyPrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "ai-image";
}

/**
 * Build the generate_image tool. Returns null when no Gemini API key
 * is configured so buildToolRegistry can skip it cleanly (same pattern
 * as buildWebSearchTool).
 */
export async function buildImageGenerationTool(): Promise<ToolPair | null> {
  const key = await getGeminiImageKey();
  if (!key) return null;

  return {
    definition: {
      name: "generate_image",
      description:
        "Generate a new image using Google Gemini Nano Banana. " +
        "Use this when the content you're producing benefits from a custom illustration, " +
        "header image, or diagram. On success returns a Markdown image tag " +
        "(![alt](url)) you can embed directly in the article body — every " +
        "generated image is saved to the site media library, optimized into " +
        "WebP variants, and labeled as AI-generated. " +
        "STRICT FAILURE RULE: if this tool returns a string starting with " +
        "\"Image generation failed\" you MUST omit images from your final " +
        "output entirely. Do NOT invent a placeholder URL, do NOT insert " +
        "\"image coming soon\" text, do NOT use a stock URL — just write " +
        "the article without an image. A missing image is correct; a " +
        "hallucinated one is not.",
      input_schema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description:
              "A detailed description of the image to generate. Include subject, style, " +
              "composition, lighting, mood. The clearer and more specific, the better.",
          },
          folder: {
            type: "string",
            description:
              "Optional media library folder to save into (e.g. \"blog\"). Defaults to \"ai-generated\".",
          },
        },
        required: ["prompt"],
      },
    },
    handler: async (input) => {
      const prompt = String(input.prompt ?? "").trim();
      if (!prompt) return "Tool error: prompt is required.";
      const folderRaw = String(input.folder ?? "ai-generated").trim();
      const folder = folderRaw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60) || "ai-generated";

      try {
        // 1. Call Gemini Nano Banana
        const generated = await generateImage({ prompt });

        // 2. Build a stable filename: <slug>-<hash>.<ext>
        const ext = generated.mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
        const hash = Math.random().toString(36).slice(2, 6);
        const filename = `${slugifyPrompt(prompt)}-${hash}.${ext}`;

        // 3. Save the original via the media adapter (filesystem or GitHub)
        const adapter = await getMediaAdapter();
        const result = await adapter.uploadFile(filename, generated.buffer, folder);
        const url = adapter.type === "filesystem" ? `${UPLOAD_BASE}${result.url}` : result.url;
        const metaKey = folder ? `${folder}/${filename}` : filename;

        // 4. Generate WebP variants if filesystem-backed (mirrors the upload route)
        if (adapter.type === "filesystem" && isProcessableImage(filename)) {
          try {
            const sitePaths = await getActiveSitePaths();
            const uploadDir = folder ? join(sitePaths.uploadDir, folder) : sitePaths.uploadDir;
            const { readSiteConfig } = await import("@/lib/site-config");
            const siteConfig = await readSiteConfig();
            if (siteConfig.mediaAutoOptimize !== false) {
              const variantConfigs = (siteConfig.mediaVariantWidths ?? [400, 800, 1200, 1600]).map(
                (w: number) => ({ suffix: `${w}w`, width: w }),
              );
              const variants = await generateVariants(
                generated.buffer,
                filename,
                variantConfigs,
                siteConfig.mediaWebpQuality ?? 80,
              );
              for (const v of variants) {
                await writeFile(join(uploadDir, v.filename), v.buffer);
              }
            }
          } catch (variantErr) {
            console.error("[generate_image] variant generation failed:", variantErr);
          }
        }

        // 5. AI vision analysis (alt-text, caption, tags) — same call uploads use.
        //    We await this one (unlike the upload route's fire-and-forget) because
        //    the agent wants the alt-text in its returned Markdown snippet.
        let alt = prompt.slice(0, 120);
        let caption = "";
        let tags: string[] = [];
        let analysisProvider = "";
        try {
          const analysis = await analyzeImage(generated.buffer, generated.mimeType, "en");
          if (analysis) {
            alt = analysis.alt || alt;
            caption = analysis.caption || "";
            tags = analysis.tags || [];
            analysisProvider = analysis.provider;
          }
        } catch (analyzeErr) {
          console.error("[generate_image] AI analysis failed:", analyzeErr);
        }

        // 6. Persist metadata with the AI-generated marker so the media UI
        //    can filter + badge.
        await appendMediaMeta(metaKey, {
          generatedByAi: true,
          generatedByModel: generated.provider,
          generatedAt: new Date().toISOString(),
          generatedPrompt: prompt,
          aiCaption: caption || undefined,
          aiAlt: alt,
          aiTags: tags.length > 0 ? tags : undefined,
          aiAnalyzedAt: new Date().toISOString(),
          aiProvider: analysisProvider || undefined,
        });

        // 7. Charge the cockpit budget. addCost is sync-safe; ignore failures.
        await addCost(NANO_BANANA_COST_PER_IMAGE_USD).catch(() => {});

        // 8. Return a Markdown image tag the agent can splat into its body.
        const safeAlt = alt.replace(/[\[\]]/g, "");
        return [
          `![${safeAlt}](${url})`,
          ``,
          `Saved to media library as \`${metaKey}\`. Cost: $${NANO_BANANA_COST_PER_IMAGE_USD.toFixed(3)}.`,
          tags.length > 0 ? `Tags: ${tags.join(", ")}.` : "",
        ]
          .filter(Boolean)
          .join("\n");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown error";
        // Tool description tells the agent that any string starting with
        // "Image generation failed" means: omit images entirely, do not
        // hallucinate a placeholder URL.
        return `Image generation failed: ${msg}. Per the tool description: do NOT include any image in your final output. Continue writing the article without an image.`;
      }
    },
  };
}
