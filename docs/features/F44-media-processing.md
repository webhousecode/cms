# F44 — Media Processing Pipeline

> Sharp-based image processing, responsive variant generation, SVG optimization, audio waveforms, and AI alt-text — as the `@webhouse/cms-media` package.

## Problem

Uploaded media is stored as-is. No resizing, no format conversion, no responsive `srcset` generation. Sites either rely on Next.js image optimization at request time (slow first hit, no AVIF for non-Vercel hosts) or serve unoptimized originals. SVGs are never cleaned. Audio files have no visual representation for podcast UIs.

## Solution

A dedicated `@webhouse/cms-media` package that processes media on upload. The MediaAdapter calls the pipeline after writing the original file, producing optimized variants stored alongside the original. Sites consume variants via a simple URL convention (`/images/hero.jpg` → `/images/hero.webp`, `/images/hero-800w.webp`).

## Technical Design

### 1. Package Structure

```
packages/cms-media/
  src/
    index.ts                    # Public API
    pipeline.ts                 # Orchestrates processing steps
    processors/
      image.ts                  # Sharp: resize, convert, optimize
      svg.ts                    # SVGO optimization
      audio.ts                  # Waveform generation
      alt-text.ts               # AI alt-text via cms-ai
    variants.ts                 # Responsive variant definitions
    types.ts                    # Shared types
  package.json
```

### 2. Core Types

```typescript
// packages/cms-media/src/types.ts

export interface MediaPipelineConfig {
  /** Image variants to generate */
  variants: ImageVariant[];
  /** Output formats (originals are always kept) */
  formats: ("webp" | "avif" | "png" | "jpg")[];
  /** JPEG/WebP quality (1-100) */
  quality: number;
  /** Enable SVG optimization */
  svgo: boolean;
  /** Enable AI alt-text generation */
  aiAltText: boolean;
  /** Enable audio waveform generation */
  audioWaveforms: boolean;
}

export interface ImageVariant {
  /** Variant suffix, e.g. "800w" → hero-800w.webp */
  suffix: string;
  /** Max width in pixels */
  width: number;
  /** Max height (optional, maintains aspect ratio if omitted) */
  height?: number;
  /** Resize fit mode */
  fit?: "cover" | "contain" | "fill" | "inside" | "outside";
}

export interface ProcessedMedia {
  /** Original file path */
  original: string;
  /** Generated variant paths */
  variants: { path: string; width: number; format: string }[];
  /** Generated srcset string */
  srcset?: string;
  /** AI-generated alt text */
  altText?: string;
  /** Audio waveform data (for audio files) */
  waveform?: number[];
}

export const DEFAULT_VARIANTS: ImageVariant[] = [
  { suffix: "400w", width: 400 },
  { suffix: "800w", width: 800 },
  { suffix: "1200w", width: 1200 },
  { suffix: "1600w", width: 1600 },
];
```

### 3. Image Processor (Sharp)

```typescript
// packages/cms-media/src/processors/image.ts

import sharp from "sharp";
import type { ImageVariant, MediaPipelineConfig } from "../types.js";

export async function processImage(
  input: Buffer,
  filename: string,
  config: MediaPipelineConfig,
): Promise<{ variants: { buffer: Buffer; suffix: string; format: string; width: number }[] }> {
  const variants: { buffer: Buffer; suffix: string; format: string; width: number }[] = [];

  for (const variant of config.variants) {
    for (const format of config.formats) {
      const pipeline = sharp(input)
        .resize(variant.width, variant.height, { fit: variant.fit ?? "inside", withoutEnlargement: true });

      let buffer: Buffer;
      switch (format) {
        case "webp":  buffer = await pipeline.webp({ quality: config.quality }).toBuffer(); break;
        case "avif":  buffer = await pipeline.avif({ quality: config.quality }).toBuffer(); break;
        case "png":   buffer = await pipeline.png().toBuffer(); break;
        case "jpg":   buffer = await pipeline.jpeg({ quality: config.quality }).toBuffer(); break;
      }

      variants.push({ buffer: buffer!, suffix: variant.suffix, format, width: variant.width });
    }
  }

  return { variants };
}
```

### 4. SVG Optimization

```typescript
// packages/cms-media/src/processors/svg.ts

import { optimize } from "svgo";

export function optimizeSvg(input: string): string {
  const result = optimize(input, {
    multipass: true,
    plugins: [
      "preset-default",
      "removeDimensions",
      { name: "removeViewBox", active: false },
    ],
  });
  return result.data;
}
```

### 5. Audio Waveform Generation

```typescript
// packages/cms-media/src/processors/audio.ts

/**
 * Generate a waveform array (0-1 amplitude values) from audio data.
 * Uses Web Audio API decode or ffmpeg for server-side extraction.
 * Returns ~100 samples for compact visualization.
 */
export async function generateWaveform(
  audioBuffer: Buffer,
  samples?: number,
): Promise<number[]> {
  // Decode audio and downsample to `samples` amplitude peaks
  // Implementation uses audiowaveform npm package or ffmpeg
}
```

### 6. AI Alt-Text Generation

```typescript
// packages/cms-media/src/processors/alt-text.ts

import type { AiProvider } from "@webhouse/cms-ai";

export async function generateAltText(
  imageBuffer: Buffer,
  provider: AiProvider,
): Promise<string> {
  // Send image to vision model, get descriptive alt text
  // Prompt: "Describe this image in one sentence for use as alt text on a website."
}
```

### 7. MediaAdapter Integration

The pipeline hooks into `MediaAdapter.uploadFile()`. After the original file is stored, the pipeline runs and stores variants alongside it.

```typescript
// In packages/cms-admin/src/lib/media/filesystem.ts (modified)

import { processMedia } from "@webhouse/cms-media";

async uploadFile(filename: string, content: Buffer, folder?: string) {
  // 1. Store original (existing behavior)
  const { url } = await this.writeOriginal(filename, content, folder);

  // 2. Run media pipeline (new)
  const result = await processMedia(content, filename, this.pipelineConfig);

  // 3. Store variants alongside original
  for (const variant of result.variants) {
    await this.writeVariant(variant.path, variant.buffer, folder);
  }

  return { url, variants: result.variants, altText: result.altText };
}
```

### 8. Srcset Helper for Sites

```typescript
// packages/cms-media/src/variants.ts

export function buildSrcset(originalUrl: string, formats: string[] = ["webp"]): string {
  // /images/hero.jpg → /images/hero-400w.webp 400w, /images/hero-800w.webp 800w, ...
  const base = originalUrl.replace(/\.[^.]+$/, "");
  const format = formats[0] ?? "webp";
  return DEFAULT_VARIANTS
    .map(v => `${base}-${v.suffix}.${format} ${v.width}w`)
    .join(", ");
}
```

## Impact Analysis

### Files affected
- `packages/cms-media/` — entirely new package
- `packages/cms-admin/src/lib/media/filesystem.ts` — hook pipeline into upload
- `packages/cms-admin/src/lib/media/github.ts` — hook pipeline into upload
- `packages/cms-admin/src/lib/media/types.ts` — extend upload result types
- `packages/cms/src/schema/types.ts` — add `media` pipeline config

### Blast radius
- Media upload flow changes for all adapters — test both filesystem and GitHub
- Sharp dependency may cause platform-specific install issues
- Variant generation increases storage usage

### Breaking changes
- Upload API response gains `variants` and `altText` fields (additive)

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Image upload generates WebP variants at all sizes
- [ ] SVG optimization reduces file size
- [ ] AI alt-text generates descriptive text
- [ ] Srcset helper produces correct format

## Implementation Steps

1. **Create `packages/cms-media/` package** — types, package.json, tsconfig
2. **Implement Sharp image processor** — resize + convert to WebP/AVIF
3. **Implement SVGO processor** — optimize SVGs on upload
4. **Implement srcset builder** — generate srcset strings from variant paths
5. **Integrate into FilesystemMediaAdapter.uploadFile()** — call pipeline after storing original
6. **Integrate into GitHubMediaAdapter.uploadFile()** — same pattern, commit variants alongside original
7. **Implement audio waveform generation** — peaks array for podcast/audio UI
8. **Implement AI alt-text** — call vision model via cms-ai provider
9. **Add pipeline config to `cms.config.ts`** — `media: { variants, formats, quality }`
10. **Test** — upload images, verify variants are created, verify srcset output

## Dependencies

- **MediaAdapter interface** — `packages/cms-admin/src/lib/media/types.ts` (existing)
- **cms-ai ProviderRegistry** — `packages/cms-ai/src/providers/registry.ts` (for AI alt-text)
- **Sharp** — new dependency (`sharp`)
- **SVGO** — new dependency (`svgo`)

## Effort Estimate

**Medium** — 3-4 days

- Day 1: Package scaffold, Sharp image processor, variant types
- Day 2: SVGO, srcset builder, MediaAdapter integration
- Day 3: Audio waveforms, AI alt-text
- Day 4: Config in cms.config.ts, testing, documentation
