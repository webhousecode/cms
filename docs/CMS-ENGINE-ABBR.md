# @webhouse/cms — Plan Summary

**Status:** Phase 1 & 2 complete. Phase 3 next.

## Vision

A reusable, embeddable TypeScript CMS library that any AI coding agent can install and wire into a new web project in under 60 seconds. Handles content modeling, persistence, media pipelines, AI orchestration, and static output generation — everything an AI shouldn't re-invent per project.

## Core Design Principles

- **Static-first** — production artifact is always pre-rendered HTML/CSS + minimal JS
- **AI-native, not AI-dependent** — AI powers authoring, but the site works without it
- **Schema-driven** — every field is typed, validated, introspectable
- **Human content is sacred** — field-level AI Locks prevent AI from overwriting user edits
- **Zero-config defaults** — `npx @webhouse/cms init` produces a working CMS immediately
- **Filesystem/JSON native** — content lives in `/content` as flat JSON files, fully git-committable

## Architecture

Monorepo with independent packages: `@webhouse/cms` (core), `@webhouse/cms-cli`, `@webhouse/cms-ai`, `@webhouse/cms-admin`, `@webhouse/cms-media`, framework adapters (Next.js, Astro, SvelteKit).

Two modes: **Standalone** (full site builder with routing + themes) and **Headless SDK** (content API + embeddable component).

Storage adapters: Filesystem/JSON (default, git-backed), SQLite, PostgreSQL/Supabase, Turso.

AI agents: ContentAgent (generate, rewrite, translate, SEO), SeoAgent, DesignAgent, MediaAgent — all provider-agnostic (Anthropic, OpenAI, Ollama).

## Key Technical Decision: AI Lock

`_fieldMeta` per document tracks per-field lock state. Once a human edits a field, it auto-locks — AI can never overwrite it without explicit unlock. Full audit trail with `userId`, timestamp, and model ID.

## Phases

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Schema, storage (filesystem), build pipeline, CLI, tests | ✅ Done |
| 2 | AI agents (ContentAgent, SeoAgent), hierarchical URLs, sitemap.xml | ✅ Done |
| AI Lock | Field-level protection, `_fieldMeta`, REST endpoints | ✅ Done |
| 3 | Supabase/PostgreSQL adapter, Docker + Fly.io deploy pipeline | 🔜 Next |
| 3.5 | Plugin API (prerequisite for `@webhouse/cms-plugin-shop`) | 🔜 Planned |
| 4+ | Admin dashboard, framework adapters, design system, enterprise | 📋 Future |
