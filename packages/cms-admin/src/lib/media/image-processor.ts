/**
 * F44 — Image Processing Pipeline
 *
 * Sharp-based WebP variant generation. Originals always preserved.
 * Variants stored alongside originals with predictable naming:
 *   hero.jpg → hero-400w.webp, hero-800w.webp, hero-1200w.webp, hero-1600w.webp
 */
import sharp from "sharp";

export interface VariantConfig {
  suffix: string;  // e.g. "400w"
  width: number;   // e.g. 400
}

export const DEFAULT_VARIANTS: VariantConfig[] = [
  { suffix: "400w", width: 400 },
  { suffix: "800w", width: 800 },
  { suffix: "1200w", width: 1200 },
  { suffix: "1600w", width: 1600 },
];

export interface GeneratedVariant {
  suffix: string;
  filename: string;
  buffer: Buffer;
  width: number;
  size: number;
}

/**
 * Generate WebP variants for an image.
 * Skips variants larger than the original.
 * Returns variant buffers + metadata.
 */
export async function generateVariants(
  inputBuffer: Buffer,
  originalFilename: string,
  variants: VariantConfig[] = DEFAULT_VARIANTS,
  quality: number = 80,
): Promise<GeneratedVariant[]> {
  // Use rotate() to get correct dimensions after EXIF orientation
  const rotated = sharp(inputBuffer).rotate();
  const meta = await rotated.metadata();
  // After EXIF rotation, width/height may swap — use the rotated dimensions
  const isRotated = meta.orientation && meta.orientation >= 5;
  const originalWidth = isRotated ? (meta.height ?? 9999) : (meta.width ?? 9999);
  const results: GeneratedVariant[] = [];

  for (const v of variants) {
    // Don't upscale
    if (v.width >= originalWidth) continue;

    const buffer = await sharp(inputBuffer)
      .rotate() // auto-rotate based on EXIF orientation (iPhone photos)
      .resize(v.width, undefined, { fit: "inside", withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();

    results.push({
      suffix: v.suffix,
      filename: variantFilename(originalFilename, v.suffix),
      buffer,
      width: v.width,
      size: buffer.length,
    });
  }

  return results;
}

/** Generate variant filename: hero.jpg + "800w" → hero-800w.webp */
export function variantFilename(original: string, suffix: string): string {
  const lastDot = original.lastIndexOf(".");
  if (lastDot === -1) return `${original}-${suffix}.webp`;
  return `${original.slice(0, lastDot)}-${suffix}.webp`;
}

/** Build srcset string from variant list */
export function buildSrcset(originalUrl: string, variants: { suffix: string; width: number }[]): string {
  const base = originalUrl.replace(/\.[^.]+$/, "");
  return variants.map((v) => `${base}-${v.suffix}.webp ${v.width}w`).join(", ");
}

/**
 * Upgrade <img> tags to <picture> with WebP srcset in HTML.
 * Only upgrades /uploads/ images where variants exist.
 * Originals preserved as <img> fallback inside <picture>.
 */
export function upgradeImages(
  html: string,
  hasVariant: (variantPath: string) => boolean,
  widths: number[] = [400, 800, 1200, 1600],
): string {
  return html.replace(
    /<img\s+([^>]*?)src="(\/uploads\/[^"]+\.(jpg|jpeg|png))"([^>]*?)>/gi,
    (match, pre, src, _ext, post) => {
      const base = src.replace(/\.[^.]+$/, "");
      const srcsetParts = widths
        .map((w) => ({ path: `${base}-${w}w.webp`, w }))
        .filter((v) => hasVariant(v.path));

      if (srcsetParts.length === 0) return match;

      const srcset = srcsetParts.map((v) => `${v.path} ${v.w}w`).join(", ");
      return `<picture>` +
        `<source srcset="${srcset}" type="image/webp" sizes="(max-width: 800px) 100vw, 800px">` +
        `<img ${pre}src="${src}"${post}>` +
        `</picture>`;
    },
  );
}

/** Check if a file is a processable image (not SVG, not GIF, not video) */
export function isProcessableImage(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ["jpg", "jpeg", "png", "webp", "tiff", "tif"].includes(ext ?? "");
}
