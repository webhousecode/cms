# F118 — Face Detection & Recognition

> Selective, on-demand face detection and person recognition in the Media Library. Tag every image of a known person across an entire archive with a single bulk action — running locally with zero API cost.

## Problem

Large media archives accumulate thousands of images over years. Finding every photo containing a specific person — the company founder, a recurring client, an artist whose work spans a decade — is impossible without manual tagging. WordPress, Sanity, and most headless CMSes don't offer this. Cloud APIs (AWS Rekognition, Google Vision) cost money per image and raise GDPR concerns about sending biometric data to third parties.

We want a feature that runs locally with zero per-image cost, is selective (triggered explicitly, not on every upload), supports both detection and recognition, scales to bulk operations, and respects GDPR for biometric data.

## Solution

A new **Persons** collection plus two Media Library actions: **Detect faces** (find all faces, store bounding boxes and 128-d descriptors) and **Match person** (given a known Person, find every image containing them).

Built on `@vladmandic/face-api` running server-side in Node with `@tensorflow/tfjs-node`. Models are ~12 MB total, downloaded once on first use. CPU-only — runs fine on Fly.io or Mac M1.

This feature is **opt-in per site**, gated behind a GDPR consent flow, and does **not** hook into the upload pipeline like F103 does.

## Technical Design

### 1. Library choice

`@vladmandic/face-api` — actively maintained MIT-licensed fork of face-api.js. Native Node support. Models: `ssdMobilenetv1` (~5.4 MB), `faceLandmark68Net` (~350 KB), `faceRecognitionNet` (~6.2 MB).

### 2. Persons collection

```ts
type Person = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  referenceMediaIds: string[];
  descriptors: number[][];      // 128 floats per reference
  consentRecorded: boolean;
  consentNote?: string;
  matchThreshold?: number;      // default 0.6
  createdAt: Date;
  updatedAt: Date;
};
```

### 3. Media schema additions

One nullable JSON column on `media`:

```ts
type FaceData = {
  detectedAt: Date;
  faces: Array<{
    box: { x: number; y: number; width: number; height: number };
    descriptor: number[];
    matchedPersonId?: string;
    matchConfidence?: number;
  }>;
};
```

### 4. Detection pipeline (selective)

User selects N items → Action Bar "Detect faces" → `POST /api/media/face-detect` → F60 job → for each image: resize via sharp, run `detectAllFaces().withFaceLandmarks().withFaceDescriptors()`, persist. SSE progress to UI. Throughput: ~3–8 img/sec on M1, ~1–3/sec on Fly.io shared-cpu-2x.

### 5. Matching pipeline

Open Person → "Find in library" → `POST /api/persons/:id/match { scope }`. Server iterates media with `faceData`, computes euclidean distance from each face descriptor to each reference descriptor, matches if min distance < `matchThreshold` (default 0.6). Results land in a review queue: confirm / reject / wrong-person.

### 6. GDPR & consent

Face descriptors are biometric data under GDPR Art. 9. Gated by:
- Site-level toggle in Settings (off by default)
- Modal explaining legal obligations on enable
- Per-Person `consentRecorded` flag required before matching
- `consentNote` field documenting lawful basis
- Audit log entries (F61) for enable, Person creation, bulk match jobs
- Descriptors included in personal data exports / right-to-erasure

### 7. UI surface

**Media Library:** Action Bar (F86) gets "Detect faces" and "Match person...". Filter chips: "Has faces", "Matched: [Person]". Detail view shows bounding box overlay with labels.

**Persons collection:** List + detail. Reference image upload validates immediately ("✓ Face detected" or "⚠ No face found"). "Find in library" button. Matched media list with confidence scores.

**Review queue:** "Found 47 likely matches, 12 uncertain" with confirm/reject/wrong-person actions.

### 8. Storage & performance

Models cached on disk, ~150 MB RAM after warmup. Bulk match on 1000 images with ~2 faces each: ~5–10 min on Fly.io shared-cpu-2x. SQLite handles up to ~50k images; beyond that, sqlite-vec or pgvector.

## Impact Analysis

**Users gain:** archive-wide person search, bulk historical tagging, press kit filters, optional anonymization.

**Cost:** Zero — no APIs, no per-image fees.

**Risk:** GDPR UX must prevent accidental enable. Mitigated by site toggle + per-Person consent + audit log.

**Differentiation:** Not offered by WordPress, Sanity, Strapi, Payload, or Directus. Strengthens "AI-native CMS" positioning.

## Implementation Steps

### Phase 1 — Detection only (3–4 days)
1. Add `@vladmandic/face-api` and `@tensorflow/tfjs-node`
2. Create `packages/cms/src/lib/face/` module
3. Migration: `faceData` JSON column on `media`
4. `POST /api/media/face-detect`
5. F60 job runner integration
6. SSE progress endpoint
7. Action Bar integration
8. "Has faces" filter chip
9. Bounding box overlay in detail view

### Phase 2 — Persons & recognition (4–5 days)
10. `persons` collection schema and admin UI
11. Reference image upload + descriptor extraction with validation
12. Site-level toggle + GDPR consent modal
13. Per-Person consent fields
14. `POST /api/persons/:id/match`
15. Matching job runner
16. Review queue UI
17. "Matched: [Person]" filter
18. Audit log entries

### Phase 3 — Polish (2 days)
19. GDPR documentation page
20. `matchThreshold` tuning UI
21. Export/erasure integration
22. Empty states, error handling, model download progress

### Phase 4 — Optional anonymization (2 days, deferred)
23. "Blur faces" action
24. "Blur except [Person]"
25. Output as new media variant, never destructive

## Dependencies

- **F86 (Action Bar)** — action affordances
- **F60 (Reliable Scheduler)** — bulk job execution
- **F61 (Activity Log)** — GDPR audit trail
- **F44 (Media Processing)** — sharp integration
- **F103 (AI Image Analysis)** — coordinates with; face data could later hint Gemini captions
- **F46 (Plugin System)** — could later be extracted as `@webhouse/cms-faces`

## Open Questions

1. Models: download on first use vs. bundled? Suggest first-use with explicit "Download now" button.
2. Auto-run detection before matching, or two-step? Suggest prompt: "47 of 200 unanalyzed. Detect first?"
3. Vector index for >50k images? Defer until needed.
4. Multi-tenant (F34) isolation — verify Persons strictly site-scoped.
5. Expose face data via public API (F125)? Default no. Opt-in via token scope (F128).

## Effort Estimate

- Phase 1: **3–4 days**
- Phase 2: **4–5 days**
- Phase 3: **2 days**
- Phase 4 (optional): **2 days**

**Total: ~9–13 days.** MVP demo (Phase 1 + stripped Phase 2): **~5 days**.
