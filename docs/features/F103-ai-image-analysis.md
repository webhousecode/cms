# F103 — AI Image & Video Analysis (Caption, Alt-text & Tags)

> AI-drevet billed- og videoanalyse direkte fra Media Manager — genererer caption, alt-tekst og tags. Provider-agnostisk (Anthropic Claude primær, Google Gemini fallback). Batch-analyse med streaming progress. Videoer analyseres via thumbnail-extraction (ffmpeg).

## Problem

Billeder og videoer i CMS'et mangler alt-tekst, caption og tags. Det skader SEO (Google kan ikke indeksere billeder uden alt), tilgængelighed (skærmlæsere har intet at læse), og findbarhed (ingen søgning/filtrering på indhold). Manuelt at skrive alt-tekst for 925 billeder (som Maurseth-sitet) er urealistisk. Vi har brug for AI der analyserer mediefiler og foreslår tekst som brugeren kan godkende/redigere.

## Solution

Google Gemini 2.0 Flash som vision model — generøs gratis tier (1.500 req/dag, ingen kreditkort), native JSON mode, flersproget. Vercel AI SDK (`ai` + `@ai-sdk/google`) som provider-agnostisk lag — kan skifte til OpenAI/Anthropic ved at ændre én import. Zod-baseret structured output. Single-image analyse fra Media Manager + batch-analyse med streaming progress. AI-data gemmes i `media-meta.json` (eksisterende mønster). Auto-udfyld alt-tekst ved billed-indsættelse i editor.

## Technical Design

### 1. Dependencies

```json
{
  "dependencies": {
    "ai": "^4.x",
    "@ai-sdk/google": "^1.x"
  }
}
```

Tilføjes til `packages/cms-admin/package.json`. Ingen andre dependencies.

### 2. AI Client & Schema

```typescript
// packages/cms-admin/src/lib/ai/image-analysis.ts

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";

export const imageAnalysisSchema = z.object({
  caption: z.string().describe("Beskrivende sætning om billedets indhold"),
  alt: z.string().max(125).describe("Tilgængelig alt-tekst, maks 125 tegn"),
  tags: z.array(z.string()).min(1).max(10).describe("Relevante nøgleord"),
});

export type ImageAnalysis = z.infer<typeof imageAnalysisSchema>;

function getAnalysisPrompt(language: string = "da"): string {
  const langMap: Record<string, string> = { da: "Svar på dansk.", en: "Respond in English." };
  return `Du er en billedanalytiker for et CMS galleri.
Analysér billedet og returnér struktureret data.

Regler:
- caption: Én naturlig sætning der beskriver hvad billedet viser. Vær specifik.
- alt: Kort, tilgængelig beskrivelse til skærmlæsere. Maks 125 tegn.
- tags: 3-8 relevante nøgleord. Brug enkelte ord eller korte fraser.
  Inkludér: motiv, stil, farver, stemning, kontekst.
- Undgå generiske tags som "billede" eller "foto".
${langMap[language] ?? langMap.en}`;
}

export async function analyzeImage(
  imageBuffer: Buffer,
  mimeType: string,
  language: string = "da",
): Promise<ImageAnalysis> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY not configured");

  const google = createGoogleGenerativeAI({ apiKey });
  const model = google("gemini-2.0-flash");

  const { object } = await generateObject({
    model,
    schema: imageAnalysisSchema,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: getAnalysisPrompt(language) },
        { type: "image", image: imageBuffer, mimeType: mimeType as any },
      ],
    }],
  });

  return object;
}
```

### 3. MediaMeta Extension

Udvid eksisterende `MediaMeta` interface med AI-felter:

```typescript
// packages/cms-admin/src/lib/media/types.ts — extend MediaMeta

export interface MediaMeta {
  key: string;
  name: string;
  folder: string;
  status: MediaStatus;
  trashedAt?: string;
  // AI Image Analysis (F103)
  aiCaption?: string;
  aiAlt?: string;
  aiTags?: string[];
  aiAnalyzedAt?: string;
  aiProvider?: string;
}
```

Data gemmes i eksisterende `_data/media-meta.json` — ingen ny fil, ingen database migration. Backward-kompatibelt (nye felter er optional).

### 4. API Routes

```
POST /api/media/analyze          — single image analyse
POST /api/media/analyze-batch    — batch med NDJSON streaming
POST /api/media/analyze-test     — test API key
GET  /api/media/analyze-status   — batch progress
```

#### Single Image

```typescript
// packages/cms-admin/src/app/api/media/analyze/route.ts

export async function POST(req: NextRequest) {
  const { filename, folder, language } = await req.json();

  // 1. Read image from upload dir
  const adapter = await getMediaAdapter();
  const buffer = await adapter.readFile([folder, filename].filter(Boolean));
  if (!buffer) return apiError("Image not found", 404);

  // 2. Analyze
  const mimeType = filename.endsWith(".png") ? "image/png" : "image/jpeg";
  const result = await analyzeImage(buffer, mimeType, language);

  // 3. Save to media-meta
  await saveAIAnalysis(folder, filename, result);

  return NextResponse.json(result);
}
```

#### Batch (NDJSON streaming — same pattern as Link Checker)

```typescript
// packages/cms-admin/src/app/api/media/analyze-batch/route.ts

export async function GET(req: NextRequest) {
  const language = req.nextUrl.searchParams.get("language") ?? "da";
  // Stream NDJSON: { kind: "start", total } → { kind: "result", ... } → { kind: "done" }
  // 4s delay between calls (Gemini free tier: 15 RPM)
  // Skip already-analyzed images
}
```

### 5. UI — Media Manager Integration

#### Analyze Button (per billede)

I media grid/list, ny action button med Sparkles ikon:

```
┌──────────────┐
│   [billede]  │
├──────────────┤
│ filnavn.jpg  │
│ [✨] [✏] [🗑]│  ← Sparkles = Analyze
└──────────────┘
```

States: Default → Spinner → Success (grøn check) → Already analyzed (viser caption snippet)

#### AI Result Panel

Popover/panel der vises efter analyse:

```
┌─────────────────────────────────────┐
│ AI Analysis                   [🔄]  │
│                                     │
│ Caption:                            │
│ [redigerbart tekstfelt]             │
│                                     │
│ Alt-text (125 chars):               │
│ [redigerbart tekstfelt]             │
│                                     │
│ Tags:                               │
│ [maleri] [atelier] [kunst] [×]      │
│                                     │
│            [Apply] [Apply & Next]    │
└─────────────────────────────────────┘
```

- **Apply** — gemmer AI-data i media-meta
- **Apply & Next** — gemmer og springer til næste uanalyserede billede
- Alle felter redigerbare inden gem — AI foreslår, brugeren beslutter

#### Batch Analyze Dialog

Tilgængelig fra Media Manager toolbar: **"✨ Analyze All"**

```
┌─────────────────────────────────────────────┐
│ Batch Analysis                         [X]  │
│                                             │
│ 47 images without analysis found.           │
│ ⏱ Estimated: ~3 min (4s/image)              │
│                                             │
│ ████████████████░░░░░  23/47  49%           │
│                                             │
│ ✅ billede-001.jpg — "Abstrakt maleri..."   │
│ ⏳ billede-003.jpg — Analyzing...           │
│ ⬜ billede-004.jpg                          │
│                                             │
│ Results saved continuously.                 │
│                                             │
│              [Pause]  [Stop & Review]       │
└─────────────────────────────────────────────┘
```

NDJSON streaming (same pattern as Link Checker). Pause/resume. Fejlede billeder springes over.

### 6. API Key Onboarding

Første gang bruger klikker ✨ uden API key → inline dialog:

```
┌─────────────────────────────────────────────┐
│ 🔑 API Key Required                        │
│                                             │
│ Get a free API key from Google AI Studio:   │
│ 🔗 https://aistudio.google.com/apikey       │
│                                             │
│ 1. Sign in with Google                      │
│ 2. Click "Create API Key"                   │
│ 3. Paste here:                              │
│                                             │
│ API Key: [________________________________] │
│                                             │
│ ✅ Free — up to 1,500 images/day            │
│ ✅ No credit card required                  │
│                                             │
│              [Save & Analyze]  [Cancel]      │
└─────────────────────────────────────────────┘
```

Key gemmes i `_data/ai-config.json` (eksisterende fil — allerede brugt af AI cockpit).

### 7. Editor Integration

Når et billede indsættes i richtext og har `aiAlt` i media-meta:
- Auto-udfyld `alt` attribut med `aiAlt`
- Vis caption som `title` attribut (TipTap's image title)

### 8. Video Analysis via Thumbnail

Videoer (MP4, MOV, WebM, AVI, MKV, M4V) analyseres via deres thumbnail:

1. `/api/media/analyze` detecter video-extension → henter thumbnail fra `/api/media/video-thumb`
2. Thumbnail (JPEG frame fra ffmpeg) sendes til samme AI vision pipeline som billeder
3. Caption, alt-text og tags genereres baseret på video-framets indhold
4. "Analyze All" inkluderer videoer automatisk
5. AI badge (gold sparkle) vises på analyserede videoer i grid + list view
6. Lightbox AI panel vises for videoer (samme layout som billeder)

**Krav:** ffmpeg installeret lokalt. Thumbnails caches i `_data/.cache/video-thumbs/`.

### 9. Provider Strategy

Anthropic Claude som primær provider (bedst vision quality, allerede konfigureret for de fleste CMS installs). Google Gemini som fallback (generøs gratis tier men upålidelig quota). Provider-agnostisk via Vercel AI SDK.

| Provider | Model | Pris/billede | Package |
|----------|-------|-------------|---------|
| **Anthropic** (primær) | `claude-sonnet-4-20250514` | ~$0.001 | `@ai-sdk/anthropic` |
| Google Gemini (fallback) | `gemini-2.5-flash` | Gratis (1.500/dag) | `@ai-sdk/google` |

### 10. Overwrite Setting

Site Setting `aiImageOverwrite` med 3 states:
- **"ask"** (default) — batch dialog viser checkbox "Re-analyze images that already have AI data"
- **"skip"** — batch springer automatisk allerede-analyserede over
- **"overwrite"** — batch re-analyserer alt

Hoisted til Org Settings med inheritance: defaults ← org ← site.

### 11. Alt-text Auto-Apply

- **Ved indsættelse:** Når et billede indsættes i richtext editor (upload eller Browse), hentes AI alt-tekst automatisk og sættes som `alt` attribut → `![AI alt text](/uploads/img.jpg)`
- **Apply-knap:** I AI popover (richtext context toolbar) — gold "Apply" knap skriver alt-tekst direkte ind i TipTap image node
- **Copy:** Alle felter har copy-to-clipboard knapper til manuel brug

### 12. Error Handling

| Fejl | Årsag | Bruger-besked |
|------|-------|---------------|
| 401 | Ugyldig API key | "API key is invalid. Check Settings → AI." |
| 429 | Rate limit (1.500/dag) | "Daily limit reached. Try again tomorrow." |
| 400 | Billede for stort/forkert format | "Image could not be analyzed. Max 20MB, JPG/PNG/WebP." |
| Network | Timeout | "Could not connect to AI service. Try again." |

Retry: 1× efter 2s ved timeout/5xx. Ingen retry ved 401/400. Ved 429: stop batch, vis besked.

## Impact Analysis

### Files affected

**Nye filer:**
- `packages/cms-admin/src/lib/ai/image-analysis.ts` — AI client, schema, prompt
- `packages/cms-admin/src/app/api/media/analyze/route.ts` — single image API
- `packages/cms-admin/src/app/api/media/analyze-batch/route.ts` — batch NDJSON stream
- `packages/cms-admin/src/app/api/media/analyze-test/route.ts` — test API key
- `packages/cms-admin/src/components/media/analyze-button.tsx` — sparkles button
- `packages/cms-admin/src/components/media/ai-result-panel.tsx` — result panel
- `packages/cms-admin/src/components/media/batch-analyze-dialog.tsx` — batch UI

**Modificerede filer:**
- `packages/cms-admin/src/lib/media/types.ts` — tilføj AI-felter til MediaMeta
- `packages/cms-admin/src/app/admin/(workspace)/media/page.tsx` — tilføj analyze button, batch button, AI status
- `packages/cms-admin/package.json` — tilføj `ai` + `@ai-sdk/google` dependencies

### Downstream dependents

`packages/cms-admin/src/lib/media/types.ts` importeres af:
- `src/lib/media/filesystem.ts` — uberørt, nye felter er optional i MediaMeta
- `src/lib/media/github.ts` — uberørt, nye felter er optional
- `src/lib/media/index.ts` — uberørt, re-exports types
- `src/app/admin/(workspace)/media/page.tsx` — modificeres (tilføjer AI UI)
- `src/app/api/media/route.ts` — uberørt, returns MediaFileInfo
- `src/app/api/media/rename/route.ts` — uberørt
- `src/app/api/media/restore/route.ts` — uberørt
- `src/lib/link-check-runner.ts` — uberørt, doesn't use MediaMeta

`packages/cms-admin/src/app/admin/(workspace)/media/page.tsx` — leaf page, no downstream dependents.

`packages/cms-admin/package.json` — new dependencies are additive. No breaking changes.

### Blast radius

- **MediaMeta extension er backward-kompatibel** — nye felter er optional, eksisterende `media-meta.json` filer fungerer uden ændringer
- **Ingen produktionskode ændres** — kun nye filer + additive UI i media page
- **API key er per-installation** — gemmes i `_data/ai-config.json` (eksisterende mønster)
- **Batch uses rate limiting** — 4s delay respekterer Gemini free tier (15 RPM)
- **Ingen påvirkning af build/deploy** — feature er rent admin-side

### Breaking changes

Ingen. MediaMeta-udvidelsen er additive (optional felter). Nye API routes. Nye dependencies.

### Test plan

- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] API key kan gemmes og test-knap viser grøn check
- [ ] Single image analyse returnerer caption + alt + tags
- [ ] Alt-tekst er under 125 tegn
- [ ] Tags er 3-8 stk, relevante for billedet
- [ ] Resultat gemmes i media-meta.json med aiAnalyzedAt timestamp
- [ ] Batch analyse kører med progress bar og 4s delay
- [ ] Batch springer allerede-analyserede billeder over
- [ ] Fejlede billeder i batch markeres rødt, springes over
- [ ] "Apply" gemmer data korrekt
- [ ] Editor auto-udfylder alt-tekst ved billed-indsættelse
- [ ] Manglende API key viser onboarding dialog med direkte link
- [ ] Regression: media upload, rename, delete, trash stadig fungerer

## Implementation Steps

### Fase 1: Foundation (1-2 dage)
1. Tilføj `ai` + `@ai-sdk/google` til `packages/cms-admin/package.json`
2. Opret `src/lib/ai/image-analysis.ts` — client, schema, prompt
3. Udvid `MediaMeta` i `types.ts` med AI-felter
4. Opret API routes: `analyze`, `analyze-test`, `analyze-batch`
5. Test med enkelt billede via curl

### Fase 2: Single Image UI (1 dag)
6. Opret `analyze-button.tsx` — sparkles icon i media grid
7. Opret `ai-result-panel.tsx` — caption/alt/tags editor
8. API key onboarding dialog (inline ved første klik)
9. Integrer i media page

### Fase 3: Batch & Integration (1-2 dage)
10. Opret `batch-analyze-dialog.tsx` — NDJSON streaming progress
11. Tilføj "Analyze All" knap i media toolbar
12. Editor integration — auto-udfyld alt-tekst ved billed-indsættelse
13. AI status indikator i media grid (analyzed/not-analyzed)

## Dependencies

- Eksisterende MediaAdapter + media-meta.json pattern (Done)
- Eksisterende `_data/ai-config.json` for API key storage (Done)
- Google AI Studio account (gratis, ingen kreditkort)

## Effort Estimate

**Medium** — 3-5 dage

- Dag 1-2: Foundation — AI client, schema, API routes, test
- Dag 3: Single image UI — analyze button, result panel, onboarding
- Dag 4-5: Batch analyse + editor integration + polish
