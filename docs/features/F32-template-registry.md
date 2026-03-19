# F32 — Template Registry

> Online template marketplace with high-fidelity starter templates.

## Problem

`npm create @webhouse/cms` creates a minimal project. Users who want a complete portfolio, blog, or landing page must build everything from scratch. There are no reference implementations showing best practices.

## Solution

A template registry with 5+ high-fidelity templates. Each template is a complete project: `cms.config.ts`, content, Next.js pages, and styles. Users select a template during scaffolding. Community can submit templates. Preview before install.

## Technical Design

### Template Package Structure

Each template is an npm package:

```
@webhouse/template-portfolio/
  cms.config.ts              # Collection definitions
  content/                   # Sample content documents
    projects/
    about/
    global/
  app/                       # Next.js pages
    layout.tsx
    page.tsx
    work/[slug]/page.tsx
  components/                # Reusable components
  public/                    # Static assets
  template.json              # Template metadata
```

### Template Metadata

```typescript
// template.json
export interface TemplateMetadata {
  name: string;              // e.g. "portfolio"
  label: string;             // e.g. "Portfolio"
  description: string;
  version: string;
  author: string;
  preview: string;           // URL to live preview
  screenshot: string;        // URL to screenshot
  collections: string[];     // collection names used
  features: string[];        // e.g. ["i18n", "blocks", "AI agents"]
  dependencies: Record<string, string>;  // additional npm deps
}
```

### Registry API

```typescript
// Hosted at templates.webhouse.app

// GET /api/templates — list all templates
// GET /api/templates/[name] — get template details
// GET /api/templates/[name]/screenshot — get screenshot
// POST /api/templates — submit template (community, requires auth)
```

### CLI Integration

```bash
# List templates
npx @webhouse/cms-cli templates list

# Create project from template
npm create @webhouse/cms my-site --template portfolio

# Or interactive picker
npm create @webhouse/cms my-site
# → presents template gallery with previews
```

### Scaffolding Flow

```typescript
// packages/create-cms/src/templates.ts

export async function scaffoldFromTemplate(
  projectDir: string,
  templateName: string
): Promise<void> {
  // 1. Download template package (npm registry or GitHub)
  // 2. Copy files to project dir
  // 3. Update package.json with template dependencies
  // 4. Generate CLAUDE.md with template-specific context
  // 5. Install dependencies
}
```

### Initial Templates

| Template | Description | Collections |
|----------|-------------|-------------|
| `portfolio` | Creative portfolio with projects grid | projects, about, global |
| `blog` | Full blog with categories and authors | posts, authors, categories, global |
| `docs` | Documentation site with sidebar nav | docs, changelog |
| `landing` | Landing page with sections | pages (blocks), testimonials, features |
| `business` | Business website with services | pages, services, team, blog, global |

## Impact Analysis

### Files affected
- `packages/create-cms/src/templates.ts` — new template metadata handler
- `packages/create-cms/src/index.ts` — add `--template` flag support
- Template packages: `@webhouse/template-portfolio`, `@webhouse/template-blog`, etc.

### Blast radius
- Scaffolder changes affect all new project creation — test both with and without template
- Template packages must stay in sync with @webhouse/cms versions

### Breaking changes
- None — `--template` flag is additive

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] `npm create @webhouse/cms --template portfolio` creates working project
- [ ] Interactive picker shows all available templates
- [ ] Template projects build and serve correctly
- [ ] CLAUDE.md generated with template-specific context

## Implementation Steps

1. Create template metadata schema in `packages/create-cms/src/templates.ts`
2. Build `portfolio` template as first reference implementation
3. Build `blog` template with categories, authors, and tags
4. Build `docs` template with sidebar navigation
5. Build `landing` template with block-based sections
6. Build `business` template combining blog + services + team
7. Update `packages/create-cms/` to support `--template` flag
8. Build interactive template picker with previews in CLI
9. Set up template registry API (or use npm registry directly)
10. Add "Submit Template" flow for community contributions
11. Deploy template preview sites for browsing

## Dependencies

- `packages/create-cms/` — for scaffolding integration

## Effort Estimate

**Large** — 8-10 days (mostly building 5 templates)
