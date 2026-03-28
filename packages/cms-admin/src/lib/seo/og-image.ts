/**
 * F97 — Auto-generate OG images with Sharp
 *
 * Takes a source image (hero/first content image), overlays a dark gradient
 * and the page title in white text. Outputs 1200x630 JPEG.
 */
import sharp from "sharp";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { getActiveSitePaths } from "@/lib/site-paths";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

/**
 * Generate an OG image from a source image + title overlay.
 * Returns the URL path to the generated image (e.g. /uploads/og/my-post.jpg)
 */
export async function generateOgImage(
  sourceImagePath: string,
  title: string,
  slug: string,
): Promise<string | null> {
  try {
    const { uploadDir } = await getActiveSitePaths();
    if (!uploadDir) return null;

    // Resolve source image
    const sourceFull = sourceImagePath.startsWith("/uploads/")
      ? join(uploadDir, sourceImagePath.replace(/^\/uploads\//, ""))
      : join(uploadDir, sourceImagePath);

    if (!existsSync(sourceFull)) return null;

    const sourceBuffer = readFileSync(sourceFull);

    // Resize + crop source to 1200x630
    const resized = await sharp(sourceBuffer)
      .resize(OG_WIDTH, OG_HEIGHT, { fit: "cover", position: "center" })
      .toBuffer();

    // Create dark gradient overlay (bottom half gets darker)
    const gradient = Buffer.from(
      `<svg width="${OG_WIDTH}" height="${OG_HEIGHT}">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="black" stop-opacity="0.1"/>
            <stop offset="0.5" stop-color="black" stop-opacity="0.3"/>
            <stop offset="1" stop-color="black" stop-opacity="0.75"/>
          </linearGradient>
        </defs>
        <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#g)"/>
      </svg>`,
    );

    // Create title text overlay
    // Truncate title to fit, estimate ~30 chars per line at this size
    const cleanTitle = title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const maxChars = 60;
    const displayTitle = cleanTitle.length > maxChars ? cleanTitle.slice(0, maxChars - 1) + "…" : cleanTitle;

    const textSvg = Buffer.from(
      `<svg width="${OG_WIDTH}" height="${OG_HEIGHT}">
        <text x="60" y="${OG_HEIGHT - 60}" fill="white" font-family="system-ui, -apple-system, sans-serif"
          font-size="48" font-weight="700" style="text-shadow: 0 2px 8px rgba(0,0,0,0.5)">
          ${displayTitle}
        </text>
      </svg>`,
    );

    // Composite: source → gradient → text
    const result = await sharp(resized)
      .composite([
        { input: gradient, blend: "over" },
        { input: textSvg, blend: "over" },
      ])
      .jpeg({ quality: 85 })
      .toBuffer();

    // Write to uploads/og/
    const ogDir = join(uploadDir, "og");
    mkdirSync(ogDir, { recursive: true });
    const filename = `${slug}.jpg`;
    writeFileSync(join(ogDir, filename), result);

    return `/uploads/og/${filename}`;
  } catch (err) {
    console.error("[og-image] Generation failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
