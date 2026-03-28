# F06 — Content Speaker (TTS)

> Text-to-speech for any content — generate audio versions of blog posts and pages.

## Problem

Content is text-only. There is no way to offer audio versions of articles for accessibility or user preference. Generating audio requires external tools and manual file management.

## Solution

Integrate TTS (ElevenLabs or OpenAI TTS) to auto-generate audio for published content. An embedded audio player component is rendered on the site. Audio can be generated on publish or on demand.

## Technical Design

### Configuration

```typescript
// packages/cms/src/schema/types.ts — extend CmsConfig
export interface TtsConfig {
  provider: 'openai' | 'elevenlabs';
  voice?: string;            // e.g. "alloy", "shimmer" (OpenAI) or ElevenLabs voice ID
  autoGenerateOnPublish?: boolean;
  collections?: string[];    // which collections get TTS, default: all with richtext
}

// In CmsConfig:
tts?: TtsConfig;
```

### TTS Service

```typescript
// packages/cms-ai/src/agents/tts.ts

export interface TtsResult {
  audioUrl: string;      // path to generated audio file
  duration: number;      // seconds
  voiceId: string;
  generatedAt: string;
}

export class TtsAgent {
  constructor(private provider: AiProvider) {}

  async generateAudio(text: string, options: {
    voice?: string;
    format?: 'mp3' | 'wav';
  }): Promise<Buffer>;

  /** Extract plain text from richtext/markdown content */
  static extractPlainText(content: string): string;
}
```

### Storage

Audio files stored at `<contentDir>/../public/audio/<collection>/<slug>.mp3`. Metadata added to document:

```typescript
// Added to document data automatically
{
  _audio: {
    url: '/audio/posts/my-post.mp3',
    duration: 245,
    voice: 'alloy',
    generatedAt: '2026-03-15T10:00:00Z',
  }
}
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/admin/tts/generate` | Generate audio for a document |
| `DELETE` | `/api/admin/tts/[collection]/[slug]` | Delete generated audio |

### Frontend Component

```typescript
// Provided as a reusable component in docs
export function AudioPlayer({ src, title }: { src: string; title: string }) {
  return (
    <div className="audio-player">
      <audio controls src={src} />
      <span>Listen to this article</span>
    </div>
  );
}
```

## Impact Analysis

### Files affected
- `packages/cms-ai/src/agents/tts.ts` — new TTS agent
- `packages/cms/src/schema/types.ts` — add `tts` config to `CmsConfig`
- `packages/cms-admin/src/app/api/admin/tts/route.ts` — new API route
- `packages/cms-admin/src/components/editor/document-editor.tsx` — add Generate Audio button

### Blast radius
- `CmsConfig` type change affects all config consumers — must be optional
- Document editor gains new button — test existing layout

### Breaking changes
- None — `tts` config is optional

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Audio generated from document content via OpenAI TTS
- [ ] Audio file stored at expected path
- [ ] `_audio` metadata added to document
- [ ] Generate Audio button only shows when TTS configured

## Implementation Steps

1. Create `packages/cms-ai/src/agents/tts.ts` with OpenAI TTS and ElevenLabs support
2. Add `tts` config option to `CmsConfig` in `packages/cms/src/schema/types.ts`
3. Create API route `packages/cms-admin/src/app/api/admin/tts/route.ts`
4. Add "Generate Audio" button on document edit page when TTS is configured
5. Add audio player preview in admin document view
6. Implement auto-generate hook on publish (if `autoGenerateOnPublish: true`)
7. Add audio file cleanup when document is deleted
8. Document the `AudioPlayer` component for site developers


> **NOTE — F107 Chat Integration:** When this feature introduces new API routes, tools, or admin actions, ensure they are also exposed as tool-use functions in F107 (Chat with Your Site). The chat interface must be able to perform any action the traditional admin UI can. See `docs/features/F107-chat-with-your-site.md`.

## Dependencies

- F25 (Storage Buckets) — optional, can use local filesystem
- OpenAI or ElevenLabs API key

## Effort Estimate

**Medium** — 2-3 days

---

> **Testing (F99):** This feature MUST include tests using the [F99 Test Infrastructure](F99-e2e-testing-suite.md).
> - **Unit tests** → `packages/cms-admin/src/lib/__tests__/{feature}.test.ts` or `packages/cms/src/__tests__/{feature}.test.ts`
> - **API tests** → `packages/cms-admin/tests/api/{feature}.test.ts`
> - **E2E tests** → `packages/cms-admin/e2e/suites/{nn}-{feature}.spec.ts`
> - Use shared fixtures: `auth.ts` (JWT login), `mock-llm.ts` (intercept AI), `test-data.ts` (seed/cleanup)
> - Tests are written BEFORE implementation. All tests must pass before merge.

> **i18n (F48):** This feature produces or manages user-facing content. All generated text,
> AI prompts, and UI output MUST respect the site's `defaultLocale` and `locales` settings.
> Use `getLocale()` for runtime locale resolution. See [F48 i18n](F48-i18n.md) for details.
