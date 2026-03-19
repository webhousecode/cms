# F10 — AI Learning Loop

> Machine learning from editor corrections to improve AI content quality over time.

## Problem

AI-generated content is often edited by humans before publishing. These corrections represent valuable feedback about tone, vocabulary, and structure preferences — but the AI never learns from them. Each generation starts from scratch.

## Solution

Track diffs between AI-generated content and the final published version. Extract patterns and use them as few-shot examples in future prompts. Quality metrics track improvement over time.

## Technical Design

### Correction Tracking

```typescript
// packages/cms-ai/src/learning/corrections.ts

export interface ContentCorrection {
  id: string;
  collection: string;
  documentSlug: string;
  field: string;
  aiOriginal: string;       // what the AI wrote
  humanEdited: string;       // what the human published
  diffSummary: string;       // AI-generated summary of what changed
  category: 'tone' | 'factual' | 'structure' | 'style' | 'vocabulary' | 'other';
  aiModel: string;
  createdAt: string;
}

export interface LearningProfile {
  siteId: string;
  collection: string;
  corrections: ContentCorrection[];
  patterns: ExtractedPattern[];
  updatedAt: string;
}

export interface ExtractedPattern {
  category: string;
  description: string;       // e.g. "Prefers shorter paragraphs, max 3 sentences"
  examples: Array<{ before: string; after: string }>;
  confidence: number;         // 0-1 based on frequency
}
```

### Storage

Corrections stored at `<dataDir>/learning/<collection>.json`.

### Learning Pipeline

```typescript
// packages/cms-ai/src/learning/pipeline.ts

export class LearningPipeline {
  /** Called when a document with AI-generated fields is published */
  async recordCorrection(
    doc: Document,
    originalFieldMeta: DocumentFieldMeta,
    collection: CollectionConfig
  ): Promise<ContentCorrection[]>;

  /** Extract patterns from accumulated corrections */
  async extractPatterns(collection: string): Promise<ExtractedPattern[]>;

  /** Generate few-shot examples for prompts */
  async getFewShotExamples(collection: string, limit?: number): Promise<string>;
}
```

### Integration with Content Agent

```typescript
// In ContentAgent.generate() — inject learning context
const fewShot = await this.learning.getFewShotExamples(collection.name, 3);
const systemPrompt = `...
Based on past editorial feedback, follow these writing patterns:
${fewShot}
`;
```

### Quality Metrics

```typescript
export interface QualityMetrics {
  collection: string;
  period: string;           // e.g. "2026-03"
  totalGenerated: number;
  totalPublished: number;   // without edits
  totalEdited: number;      // published with changes
  averageEditDistance: number; // 0-1 normalized
  topCorrectionCategories: Array<{ category: string; count: number }>;
}
```

## Impact Analysis

### Files affected
- `packages/cms-ai/src/learning/corrections.ts` — new correction tracking module
- `packages/cms-ai/src/learning/pipeline.ts` — new learning pipeline
- `packages/cms-ai/src/agents/content.ts` — inject few-shot examples from learning data
- `packages/cms-admin/src/app/admin/settings/ai-learning/page.tsx` — new admin page

### Blast radius
- `ContentAgent.generate()` system prompt changes — AI output will evolve over time
- Document publish hook adds processing overhead

### Breaking changes
- None

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Corrections recorded when AI-generated content is edited before publish
- [ ] Pattern extraction identifies common corrections
- [ ] Few-shot examples injected into generation prompts
- [ ] Quality metrics display correctly

## Implementation Steps

1. Create `packages/cms-ai/src/learning/corrections.ts` with diff tracking
2. Hook into document publish: compare `_fieldMeta.aiGenerated` fields with current values
3. Use AI to categorize each correction (tone/factual/structure/style/vocabulary)
4. Create `packages/cms-ai/src/learning/pipeline.ts` for pattern extraction
5. Store learning profiles per collection at `<dataDir>/learning/`
6. Update `ContentAgent.generate()` to inject few-shot examples from learning data
7. Build quality metrics aggregation
8. Create admin page at `packages/cms-admin/src/app/admin/settings/ai-learning/page.tsx` showing metrics and patterns
9. Add "Reset learning data" button with confirmation

## Dependencies

- Existing `_fieldMeta` system that tracks AI-generated fields
- Existing `ContentAgent` in `packages/cms-ai/src/agents/content.ts`

## Effort Estimate

**Medium** — 3-4 days
