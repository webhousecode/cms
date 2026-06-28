# F155 — Migrate broberg.ai flagship-page copy into the cms Flagskibe collection

## Open questions (resolving with bas, intercom #220)
1. **Target collection** — slides on the existing `platforms` doc (`data.slides`, one 'Flagskibe' doc per node = grid card + page) vs a new collection. Leaning: extend `platforms` (label 'Flagskibe').
2. **CMS representation** of `slides` — bas's blocks are a bespoke union (k: lead/prose/chips/steps/table/quote/cards/stats/chat/callout). Option (a): store `slides[]` as one structured payload field (bas parses; decoupled + mergeproof; raw admin edit). Option (b): model each slide/block as real cms fields (full admin editing; couples cms schema to bas's renderer struct). Pending bas's recommendation.
3. **Export format** — bas dumps the 12 current FlagshipPage objects as JSON ({slug, description?, cta?, slides[]}), ideally a committed raw-URL, so cms ingests the EXACT copy (zero drift).

## Motivation
The flagship PAGE copy is hardcoded in `src/components/FlagshipSlides.tsx` (bas, a TSX registry of FlagshipPage objects). Grid CARDS are already cms content (`platforms` → ICD → bas store), but the page slides never made it to cms — a deliberate v1 shortcut. Consequences: (a) breaks the 'content lives in cms' principle, (b) copy is not editable in the admin, (c) a git-merge silently regressed 3 flagships on 2026-06-27 (code can be reverted; cms content cannot). See memory `broberg-ai-content-wipe-bug`.

## Scope (cms side)
- Add the flagship-page fields (`slides`, `description`, `cta`) to the `platforms` collection schema so the data is declared, not stripped, and (depending on Q2) editable.
- Ingest the 12 flagships' slide copy (from bas's verbatim export) into the platform docs — byte-identical, zero rewrite/drift.
- The ingested data persists on /data (durable, post-F154/wipe-fix) and ICD-pushes to bas's store.

### Non-goals
- The RENDERING ENGINE stays in bas's code (FlagshipSlides component, block-views, illustrations, logos). cms only owns the DATA.
- No copy rewriting — migrate the exact current text.
- Do not remove the code registry — it stays as the fallback (resilience: site survives cms-empty/down).

## Architecture
slides live on each `platforms` doc (`data.slides`). cms write → ICD-push → bas store. bas's `renderFlagshipDetail` prefers cms `data.slides`, falls back to the code registry when absent (no naked cutover). Mirrors the existing grid-card decoupling (content in cms, engine in code).

## Dependencies (bas)
- Export the 12 FlagshipPage objects as JSON (Q3).
- Wire `loadFlagship(slug)` / `renderFlagshipDetail` to read cms `data.slides` with code-registry fallback (bas's domain / board).

## Rollout (safe, additive)
1. bas exports the 12 → cms ingests verbatim (data in cms, code unchanged → zero visible change yet).
2. bas wires the renderer to prefer cms + keep registry fallback.
3. Lens-verify all 12 flagship pages render IDENTICALLY to the pre-migration version (now sourced from cms).
4. Fallback stays as the net. Cutover proven before anything is removed.
