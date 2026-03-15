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

## Implementation Steps

1. Create `packages/cms-ai/src/agents/tts.ts` with OpenAI TTS and ElevenLabs support
2. Add `tts` config option to `CmsConfig` in `packages/cms/src/schema/types.ts`
3. Create API route `packages/cms-admin/src/app/api/admin/tts/route.ts`
4. Add "Generate Audio" button on document edit page when TTS is configured
5. Add audio player preview in admin document view
6. Implement auto-generate hook on publish (if `autoGenerateOnPublish: true`)
7. Add audio file cleanup when document is deleted
8. Document the `AudioPlayer` component for site developers

## Dependencies

- F25 (Storage Buckets) — optional, can use local filesystem
- OpenAI or ElevenLabs API key

## Effort Estimate

**Medium** — 2-3 days
