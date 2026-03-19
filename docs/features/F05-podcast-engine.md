# F05 — Podcast Engine

> First-class podcast support with episode management, RSS feed generation, and AI transcription.

## Problem

There is no built-in way to manage podcast content. Users who want to host a podcast must manually create episodes as regular documents, manage audio files by hand, and generate RSS feeds externally.

## Solution

A podcast engine that provides an episode collection template, audio file management, RSS feed generation compatible with Apple Podcasts and Spotify, and AI-powered episode summaries and transcription.

## Technical Design

### Collection Template

The podcast engine auto-generates two collections when enabled:

```typescript
// packages/cms/src/template/podcast.ts

export const podcastShowCollection: CollectionConfig = {
  name: 'podcast-show',
  label: 'Podcast Show',
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'description', type: 'richtext', required: true },
    { name: 'author', type: 'text', required: true },
    { name: 'email', type: 'text', label: 'Owner Email' },
    { name: 'language', type: 'text', label: 'Language Code', defaultValue: 'en' },
    { name: 'category', type: 'select', options: [
      { label: 'Technology', value: 'Technology' },
      { label: 'Business', value: 'Business' },
      { label: 'Education', value: 'Education' },
      // ... Apple Podcasts categories
    ]},
    { name: 'coverImage', type: 'image', label: 'Cover Art (3000x3000)' },
    { name: 'explicit', type: 'boolean', defaultValue: false },
  ],
};

export const podcastEpisodeCollection: CollectionConfig = {
  name: 'podcast-episodes',
  label: 'Podcast Episodes',
  urlPrefix: '/podcast',
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'episodeNumber', type: 'number', label: 'Episode #' },
    { name: 'season', type: 'number', label: 'Season #' },
    { name: 'audioFile', type: 'text', label: 'Audio File URL' },
    { name: 'duration', type: 'text', label: 'Duration (HH:MM:SS)' },
    { name: 'fileSize', type: 'number', label: 'File Size (bytes)' },
    { name: 'description', type: 'textarea', label: 'Short Description' },
    { name: 'showNotes', type: 'richtext', label: 'Show Notes' },
    { name: 'transcript', type: 'richtext', label: 'Transcript' },
    { name: 'chapters', type: 'array', label: 'Chapters', fields: [
      { name: 'time', type: 'text', label: 'Timestamp (HH:MM:SS)' },
      { name: 'title', type: 'text', label: 'Chapter Title' },
    ]},
    { name: 'guests', type: 'tags', label: 'Guests' },
    { name: 'coverImage', type: 'image', label: 'Episode Cover' },
    { name: 'explicit', type: 'boolean', defaultValue: false },
    { name: 'episodeType', type: 'select', options: [
      { label: 'Full', value: 'full' },
      { label: 'Trailer', value: 'trailer' },
      { label: 'Bonus', value: 'bonus' },
    ]},
  ],
};
```

### RSS Feed Generation

```typescript
// packages/cms/src/build/podcast-rss.ts

export function generatePodcastRss(
  show: Document,
  episodes: Document[],
  baseUrl: string
): string {
  // Returns valid Apple Podcasts / Spotify RSS XML
  // Includes <itunes:*> tags, <podcast:chapters>, enclosures
}
```

### AI Transcription

```typescript
// packages/cms-ai/src/agents/podcast.ts

export class PodcastAgent {
  /** Transcribe audio using OpenAI Whisper API */
  async transcribe(audioUrl: string): Promise<string>;
  /** Generate episode summary from transcript */
  async summarize(transcript: string): Promise<string>;
  /** Extract chapters from transcript */
  async extractChapters(transcript: string): Promise<Array<{ time: string; title: string }>>;
}
```

## Impact Analysis

### Files affected
- `packages/cms/src/template/podcast.ts` — new podcast collection templates
- `packages/cms/src/build/podcast-rss.ts` — new RSS feed generator
- `packages/cms-ai/src/agents/podcast.ts` — new podcast AI agent
- `packages/cms-admin/src/app/admin/podcast/page.tsx` — new admin page
- `packages/cms-admin/src/app/api/admin/` — audio upload and transcription endpoints

### Blast radius
- Build pipeline gains new RSS output — must not interfere with existing sitemap/llms.txt generation
- Media upload API extended to accept audio files

### Breaking changes
- None

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] RSS feed validates against Apple Podcasts spec
- [ ] Audio file upload accepts .mp3, .m4a, .wav
- [ ] Whisper transcription returns text
- [ ] Episode player renders in admin

## Implementation Steps

1. Create `packages/cms/src/template/podcast.ts` with show and episode collection configs
2. Create `packages/cms/src/build/podcast-rss.ts` RSS feed generator
3. Add RSS route to build pipeline: `/podcast/feed.xml`
4. Create `packages/cms-ai/src/agents/podcast.ts` with Whisper transcription
5. Add audio file upload support to media upload API (accept `.mp3`, `.m4a`, `.wav`)
6. Build podcast admin page at `packages/cms-admin/src/app/admin/podcast/page.tsx`
7. Add episode player component for preview in admin
8. Wire "Transcribe" button on episode edit page that calls the podcast agent

## Research: Podcastfy

Check out [Podcastfy](https://github.com/souzatharsis/podcastfy) — a Python library for NotebookLM-style AI-generated podcasts. Could be used as inspiration or integrated directly for:

- Generating conversational podcast episodes from CMS content (blog posts, docs, etc.)
- Multi-voice TTS with natural dialogue
- Content-to-podcast pipeline

## Podcast Agent

Build a dedicated **Podcast Agent** in `packages/cms-ai/src/agents/podcast.ts` that can:

- Generate podcast episodes from existing site content (à la NotebookLM)
- Transcribe uploaded audio (Whisper)
- Summarize episodes and extract chapters
- Create show notes from transcripts
- Orchestrate the full content → audio → published episode pipeline

## Dependencies

- F25 (Storage Buckets) — for audio file storage (can use local filesystem initially)
- OpenAI API key — for Whisper transcription
- Podcastfy or similar — for AI-generated conversational audio

## Effort Estimate

**Large** — 5-7 days
