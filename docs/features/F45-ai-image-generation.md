# F45 — AI Image Generation

> Generate images from text prompts directly in the Media Manager and editor toolbar. Multi-provider support (Flux, DALL-E, Stable Diffusion) via a registry pattern matching the existing cms-ai text providers.

## Problem

Content creators need images for blog posts, hero sections, and social cards. Today they leave the CMS to use external image generation tools, download the result, then upload it back. This breaks the authoring flow and adds friction. The CMS already has an AI provider registry for text — images should follow the same pattern.

## Solution

Add image generation providers to `@webhouse/cms-ai` using the same registry pattern as text providers. Surface the capability in two places: the Media Manager (standalone generation) and the richtext editor image toolbar (inline generation). Generated images pass through the F44 media pipeline for optimization before storage.

## Technical Design

### 1. Image Provider Interface

```typescript
// packages/cms-ai/src/providers/image-types.ts

export interface ImageGenerationRequest {
  /** Text prompt describing the desired image */
  prompt: string;
  /** Negative prompt (things to avoid) */
  negativePrompt?: string;
  /** Output dimensions */
  width?: number;
  height?: number;
  /** Number of images to generate (1-4) */
  count?: number;
  /** Generation style preset */
  style?: "natural" | "vivid" | "artistic" | "photographic";
  /** Source image for image-to-image (variations, style transfer) */
  sourceImage?: Buffer;
  /** Strength of source image influence (0-1, for img2img) */
  strength?: number;
}

export interface GeneratedImage {
  /** Raw image buffer (PNG) */
  buffer: Buffer;
  /** Revised prompt (some providers expand/refine the prompt) */
  revisedPrompt?: string;
  /** Provider-specific metadata */
  meta?: Record<string, unknown>;
}

export interface ImageProvider {
  readonly name: string;
  readonly supportedFeatures: {
    textToImage: boolean;
    imageToImage: boolean;
    inpainting: boolean;
  };
  generate(request: ImageGenerationRequest): Promise<GeneratedImage[]>;
}
```

### 2. Provider Implementations

```typescript
// packages/cms-ai/src/providers/image-dalle.ts

export class DalleImageProvider implements ImageProvider {
  readonly name = "dalle";
  readonly supportedFeatures = { textToImage: true, imageToImage: false, inpainting: true };

  constructor(private apiKey?: string) {
    this.apiKey = apiKey ?? process.env["OPENAI_API_KEY"];
  }

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage[]> {
    // Call OpenAI Images API (dall-e-3 or dall-e-2)
    // POST https://api.openai.com/v1/images/generations
  }
}
```

```typescript
// packages/cms-ai/src/providers/image-flux.ts

export class FluxImageProvider implements ImageProvider {
  readonly name = "flux";
  readonly supportedFeatures = { textToImage: true, imageToImage: true, inpainting: false };

  constructor(private apiKey?: string) {
    this.apiKey = apiKey ?? process.env["BFL_API_KEY"];
  }

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage[]> {
    // Call Black Forest Labs Flux API
  }
}
```

### 3. Image Provider Registry

```typescript
// packages/cms-ai/src/providers/image-registry.ts

export interface ImageProviderConfig {
  dalle?: { apiKey?: string };
  flux?: { apiKey?: string };
  stableDiffusion?: { apiKey?: string; endpoint?: string };
  defaultProvider?: "dalle" | "flux" | "stableDiffusion";
}

export class ImageProviderRegistry {
  private providers = new Map<string, ImageProvider>();
  private defaultProviderName: string;

  constructor(config: ImageProviderConfig = {}) {
    if (config.dalle !== undefined || process.env["OPENAI_API_KEY"]) {
      this.providers.set("dalle", new DalleImageProvider(config.dalle?.apiKey));
    }
    if (config.flux !== undefined || process.env["BFL_API_KEY"]) {
      this.providers.set("flux", new FluxImageProvider(config.flux?.apiKey));
    }
    this.defaultProviderName =
      config.defaultProvider ??
      (this.providers.has("flux") ? "flux" : "dalle");
  }

  get(name?: string): ImageProvider { /* same pattern as ProviderRegistry */ }
  list(): string[] { return [...this.providers.keys()]; }
}
```

### 4. Admin API Endpoint

```typescript
// packages/cms-admin/src/app/api/ai/generate-image/route.ts

export async function POST(request: NextRequest) {
  const { prompt, negativePrompt, width, height, count, style, provider } = await request.json();

  // 1. Generate image(s) via provider
  const images = await imageRegistry.get(provider).generate({
    prompt, negativePrompt, width, height, count, style,
  });

  // 2. Run through F44 media pipeline (optimize, create variants)
  const results = [];
  for (const image of images) {
    const filename = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    const processed = await processMedia(image.buffer, filename, pipelineConfig);
    const { url } = await mediaAdapter.uploadFile(filename, image.buffer, "images");
    results.push({ url, altText: prompt, revisedPrompt: image.revisedPrompt });
  }

  return NextResponse.json({ images: results });
}
```

### 5. Media Manager Integration

New "Generate" button in the Media Manager toolbar, next to "Upload":

```typescript
// packages/cms-admin/src/components/media/generate-image-dialog.tsx

export function GenerateImageDialog({ onGenerated }: { onGenerated: (url: string) => void }) {
  // - Text prompt input
  // - Style selector (natural, vivid, artistic, photographic)
  // - Dimensions selector (1024x1024, 1024x1792, 1792x1024)
  // - Provider selector (if multiple configured)
  // - Generate button → POST /api/ai/generate-image
  // - Preview grid of generated images
  // - "Use this" button → calls onGenerated(url)
}
```

### 6. Richtext Editor Integration

Add "Generate Image" option to the TipTap editor image toolbar bubble menu:

```typescript
// packages/cms-admin/src/components/editor/extensions/image-generate.ts

// Adds a toolbar button that opens GenerateImageDialog
// On selection, inserts the generated image into the editor at cursor position
```

### 7. Image-to-Image (Variations)

Right-click context menu on existing images in Media Manager:

- **Generate variations** — sends the image as `sourceImage` with a prompt
- **Style transfer** — applies a style prompt to the existing image
- **Upscale** — increases resolution (provider-dependent)

### 8. Site Settings Configuration

```typescript
// In admin UI: Site Settings → AI tab

interface AiImageSettings {
  /** Default image generation provider */
  imageProvider: "dalle" | "flux" | "stableDiffusion";
  /** Default image style */
  defaultStyle: "natural" | "vivid" | "artistic" | "photographic";
  /** Default dimensions */
  defaultWidth: number;
  defaultHeight: number;
  /** Monthly generation budget (number of images) */
  monthlyBudget?: number;
}
```

## Impact Analysis

### Files affected
- `packages/cms-ai/src/providers/image-types.ts` — new image provider interface
- `packages/cms-ai/src/providers/image-dalle.ts` — new DALL-E provider
- `packages/cms-ai/src/providers/image-flux.ts` — new Flux provider
- `packages/cms-ai/src/providers/image-registry.ts` — new image registry
- `packages/cms-admin/src/app/api/ai/generate-image/route.ts` — new API endpoint
- `packages/cms-admin/src/components/media/generate-image-dialog.tsx` — new dialog component

### Blast radius
- Media Manager toolbar gets new button — test existing upload flow
- Image generation costs real money — budget tracking important

### Breaking changes
- None

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] DALL-E generates image from prompt
- [ ] Generated image uploaded to media library
- [ ] Media Manager "Generate" button opens dialog
- [ ] Richtext editor image toolbar includes generation option

## Implementation Steps

1. **Define `ImageProvider` interface and types** in `packages/cms-ai/src/providers/image-types.ts`
2. **Implement DALL-E provider** — OpenAI Images API integration
3. **Implement Flux provider** — Black Forest Labs API integration
4. **Create `ImageProviderRegistry`** — same pattern as existing `ProviderRegistry`
5. **Add `POST /api/ai/generate-image` endpoint** in cms-admin
6. **Build `GenerateImageDialog` component** — prompt input, preview grid, style/dimension selectors
7. **Integrate into Media Manager** — "Generate" button in toolbar
8. **Integrate into richtext editor** — image toolbar bubble menu option
9. **Add image-to-image support** — variations and style transfer
10. **Add AI image settings to Site Settings → AI tab**
11. **Wire up F44 media pipeline** — post-process generated images (optimize, create variants)
12. **Test** — generate images, verify upload + optimization, verify editor insertion

## Dependencies

- **F44 Media Processing Pipeline** — generated images are post-processed through the media pipeline
- **cms-ai ProviderRegistry pattern** — `packages/cms-ai/src/providers/registry.ts` (existing, used as reference)
- **MediaAdapter** — `packages/cms-admin/src/lib/media/types.ts` (existing)
- **TipTap editor extensions** — existing image node in the richtext editor

## Effort Estimate

**Medium** — 3-4 days

- Day 1: ImageProvider interface, DALL-E + Flux providers, registry
- Day 2: API endpoint, GenerateImageDialog component
- Day 3: Media Manager integration, richtext editor integration
- Day 4: Image-to-image, Site Settings UI, testing
