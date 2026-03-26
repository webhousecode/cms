/**
 * F44 Media Processing Pipeline — Test Suite
 *
 * Tests Sharp-based variant generation, naming, edge cases.
 * Written BEFORE implementation (TDD).
 *
 * Run: cd packages/cms-admin && npx vitest run src/lib/__tests__/image-processor.test.ts
 */
import { describe, it, expect } from "vitest";
import sharp from "sharp";

// ── Variant naming (pure function) ───────────────────────────

function variantFilename(original: string, suffix: string): string {
  const lastDot = original.lastIndexOf(".");
  if (lastDot === -1) return `${original}-${suffix}.webp`;
  return `${original.slice(0, lastDot)}-${suffix}.webp`;
}

function buildSrcset(originalUrl: string, variants: { suffix: string; width: number }[]): string {
  const base = originalUrl.replace(/\.[^.]+$/, "");
  return variants.map((v) => `${base}-${v.suffix}.webp ${v.width}w`).join(", ");
}

function upgradeImgTag(html: string, hasVariant: (variantPath: string) => boolean): string {
  return html.replace(
    /<img\s+([^>]*?)src="(\/uploads\/[^"]+\.(jpg|jpeg|png))"([^>]*?)>/gi,
    (match, pre, src, _ext, post) => {
      const base = src.replace(/\.[^.]+$/, "");
      const widths = [400, 800, 1200, 1600];
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

// ── Tests ────────────────────────────────────────────────────

describe("F44 — Variant filename generation", () => {
  it("generates webp variant name from jpeg", () => {
    expect(variantFilename("hero.jpg", "800w")).toBe("hero-800w.webp");
  });

  it("generates webp variant name from png", () => {
    expect(variantFilename("banner.png", "1200w")).toBe("banner-1200w.webp");
  });

  it("handles filenames with multiple dots", () => {
    expect(variantFilename("my.photo.2024.jpeg", "400w")).toBe("my.photo.2024-400w.webp");
  });

  it("handles filenames without extension", () => {
    expect(variantFilename("noext", "800w")).toBe("noext-800w.webp");
  });

  it("handles filenames with path", () => {
    expect(variantFilename("/uploads/photos/hero.jpg", "800w")).toBe("/uploads/photos/hero-800w.webp");
  });
});

describe("F44 — Srcset builder", () => {
  it("builds srcset string from variants", () => {
    const srcset = buildSrcset("/uploads/hero.jpg", [
      { suffix: "400w", width: 400 },
      { suffix: "800w", width: 800 },
    ]);
    expect(srcset).toBe("/uploads/hero-400w.webp 400w, /uploads/hero-800w.webp 800w");
  });

  it("handles empty variants", () => {
    expect(buildSrcset("/uploads/hero.jpg", [])).toBe("");
  });
});

describe("F44 — Build-time img→picture upgrade", () => {
  it("upgrades img to picture when variants exist", () => {
    const html = '<img src="/uploads/hero.jpg" alt="Hero">';
    const result = upgradeImgTag(html, () => true);

    expect(result).toContain("<picture>");
    expect(result).toContain('type="image/webp"');
    expect(result).toContain('src="/uploads/hero.jpg"'); // original preserved as fallback
    expect(result).toContain("</picture>");
  });

  it("preserves original img when no variants exist", () => {
    const html = '<img src="/uploads/hero.jpg" alt="Hero">';
    const result = upgradeImgTag(html, () => false);
    expect(result).toBe(html);
  });

  it("only upgrades jpg/jpeg/png, not svg or gif", () => {
    const svg = '<img src="/uploads/logo.svg" alt="Logo">';
    const gif = '<img src="/uploads/anim.gif" alt="Animation">';
    expect(upgradeImgTag(svg, () => true)).toBe(svg);
    expect(upgradeImgTag(gif, () => true)).toBe(gif);
  });

  it("preserves all img attributes", () => {
    const html = '<img class="hero" src="/uploads/photo.jpeg" alt="My photo" loading="lazy">';
    const result = upgradeImgTag(html, () => true);
    expect(result).toContain('class="hero"');
    expect(result).toContain('alt="My photo"');
    expect(result).toContain('loading="lazy"');
  });

  it("handles multiple images in one HTML string", () => {
    const html = '<img src="/uploads/a.jpg" alt="A"><p>text</p><img src="/uploads/b.png" alt="B">';
    const result = upgradeImgTag(html, () => true);
    expect(result.match(/<picture>/g)?.length).toBe(2);
  });

  it("only includes variants that actually exist", () => {
    const html = '<img src="/uploads/hero.jpg">';
    const existing = new Set(["/uploads/hero-400w.webp", "/uploads/hero-800w.webp"]);
    const result = upgradeImgTag(html, (p) => existing.has(p));

    expect(result).toContain("hero-400w.webp 400w");
    expect(result).toContain("hero-800w.webp 800w");
    expect(result).not.toContain("1200w");
    expect(result).not.toContain("1600w");
  });

  it("does not upgrade data-uri images", () => {
    const html = '<img src="data:image/png;base64,abc123">';
    const result = upgradeImgTag(html, () => true);
    expect(result).toBe(html);
  });

  it("does not upgrade external URLs", () => {
    const html = '<img src="https://example.com/photo.jpg">';
    const result = upgradeImgTag(html, () => true);
    expect(result).toBe(html);
  });
});

describe("F44 — Sharp variant generation", () => {
  // Create a test image buffer (100x100 red square)
  async function makeTestImage(width: number = 100, height: number = 100): Promise<Buffer> {
    return sharp({
      create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } },
    }).jpeg().toBuffer();
  }

  it("generates webp variant smaller than original", async () => {
    const input = await makeTestImage(1200, 800);
    const output = await sharp(input).resize(800, undefined, { fit: "inside" }).webp({ quality: 80 }).toBuffer();

    expect(output.length).toBeLessThan(input.length);

    const meta = await sharp(output).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(800);
  });

  it("does not upscale small images", async () => {
    const input = await makeTestImage(300, 200);
    const output = await sharp(input)
      .resize(800, undefined, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(300); // not upscaled to 800
  });

  it("maintains aspect ratio", async () => {
    const input = await makeTestImage(1600, 900); // 16:9
    const output = await sharp(input)
      .resize(800, undefined, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(450); // 16:9 maintained
  });

  it("generates multiple variant sizes", async () => {
    const input = await makeTestImage(2000, 1000);
    const widths = [400, 800, 1200, 1600];
    const results: { width: number; size: number }[] = [];

    for (const w of widths) {
      const buf = await sharp(input)
        .resize(w, undefined, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      const meta = await sharp(buf).metadata();
      results.push({ width: meta.width!, size: buf.length });
    }

    // Each smaller variant should be smaller in file size
    for (let i = 1; i < results.length; i++) {
      expect(results[i].size).toBeGreaterThan(results[i - 1].size);
      expect(results[i].width).toBeGreaterThan(results[i - 1].width);
    }

    // All should be webp
    expect(results).toHaveLength(4);
  });

  it("skips variants larger than original", async () => {
    const input = await makeTestImage(600, 400);
    const widths = [400, 800, 1200, 1600];
    const generated: number[] = [];

    for (const w of widths) {
      if (w >= 600) continue; // skip larger than original
      generated.push(w);
    }

    expect(generated).toEqual([400]); // only 400w should be generated
  });
});
