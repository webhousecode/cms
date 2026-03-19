# F46 — Plugin System

> A `cms.registerPlugin()` API with lifecycle management, hook points for content/build/AI operations, and support for custom field types and block types via plugins.

## Problem

Extending the CMS currently requires forking packages or adding code directly to cms.config.ts hooks. There's no standardized way to package, distribute, and manage extensions. The existing content hooks in `packages/cms/src/content/hooks.ts` cover CRUD operations but there's no hook system for builds or AI generation. Custom field types and block types are hardcoded.

## Solution

A plugin system with a manifest-based registration API, lifecycle management (install/activate/deactivate/uninstall), and hook points spanning content operations (existing), build pipeline, and AI generation. Plugins can also register custom field types and custom block types. No marketplace yet — that's F32 Template Registry territory.

## Technical Design

### 1. Plugin Manifest

Plugins are npm packages following a naming convention. The manifest lives in `package.json`:

```json
{
  "name": "@webhouse/cms-plugin-analytics",
  "version": "1.0.0",
  "cms": {
    "type": "plugin",
    "displayName": "Analytics Integration",
    "description": "Injects analytics scripts into built pages",
    "hooks": ["beforeRender", "afterRender"],
    "fields": [],
    "blocks": ["analytics-dashboard"]
  },
  "main": "dist/index.js",
  "types": "dist/index.d.ts"
}
```

### 2. Plugin Interface

```typescript
// packages/cms/src/plugins/types.ts

export interface CmsPlugin {
  /** Unique plugin name (npm package name) */
  name: string;
  /** Human-readable display name */
  displayName?: string;
  /** Semantic version */
  version: string;

  /** Called when plugin is activated */
  activate?(context: PluginContext): Promise<void> | void;
  /** Called when plugin is deactivated */
  deactivate?(context: PluginContext): Promise<void> | void;
  /** Called once on first install (e.g. create tables, seed data) */
  install?(context: PluginContext): Promise<void> | void;
  /** Called on uninstall (cleanup) */
  uninstall?(context: PluginContext): Promise<void> | void;

  /** Content hooks (extends existing ContentHooks) */
  contentHooks?: ContentHooks;
  /** Build hooks */
  buildHooks?: BuildHooks;
  /** AI hooks */
  aiHooks?: AiHooks;

  /** Custom field type definitions */
  fields?: CustomFieldType[];
  /** Custom block type definitions */
  blocks?: CustomBlockType[];
}

export interface PluginContext {
  /** CMS config */
  config: CmsConfig;
  /** Storage adapter */
  storage: StorageAdapter;
  /** Logger */
  log: PluginLogger;
  /** Plugin-specific data directory */
  dataDir: string;
}
```

### 3. Build Hooks

```typescript
// packages/cms/src/plugins/types.ts

export interface BuildHooks {
  /** Called before a page is rendered to HTML */
  beforeRender?(page: BuildPage, context: BuildContext): Promise<BuildPage> | BuildPage;
  /** Called after a page is rendered to HTML */
  afterRender?(html: string, page: BuildPage, context: BuildContext): Promise<string> | string;
  /** Called before output is written to disk */
  beforeOutput?(pages: RenderedPage[], context: BuildContext): Promise<RenderedPage[]> | RenderedPage[];
  /** Called after all output is written */
  afterBuild?(result: BuildResult, context: BuildContext): Promise<void> | void;
}

export interface BuildContext {
  config: CmsConfig;
  outDir: string;
  allPages: BuildPage[];
}
```

### 4. AI Hooks

```typescript
// packages/cms/src/plugins/types.ts

export interface AiHooks {
  /** Called before AI generates content — can modify the prompt */
  beforeGenerate?(prompt: string, collection: string, context: AiHookContext): Promise<string> | string;
  /** Called after AI generates content — can modify the result */
  afterGenerate?(result: Record<string, unknown>, collection: string, context: AiHookContext): Promise<Record<string, unknown>> | Record<string, unknown>;
}

export interface AiHookContext {
  provider: string;
  model: string;
  agent: string;
}
```

### 5. Custom Field Types

```typescript
// packages/cms/src/plugins/types.ts

export interface CustomFieldType {
  /** Field type name (used in cms.config.ts) */
  type: string;
  /** Display label for admin UI */
  label: string;
  /** Validation function */
  validate?(value: unknown): string | null;
  /** Default value factory */
  defaultValue?(): unknown;
  /** Path to React component for admin UI rendering */
  adminComponent: string;
  /** JSON Schema for the field value (used in OpenAPI spec) */
  jsonSchema: Record<string, unknown>;
}
```

### 6. Custom Block Types

```typescript
// packages/cms/src/plugins/types.ts

export interface CustomBlockType {
  /** Block name */
  name: string;
  /** Display label */
  label: string;
  /** Block fields */
  fields: FieldConfig[];
  /** Path to React component for admin UI preview */
  adminPreviewComponent?: string;
}
```

### 7. Plugin Registration API

```typescript
// packages/cms/src/plugins/registry.ts

export class PluginRegistry {
  private plugins = new Map<string, { plugin: CmsPlugin; active: boolean }>();

  /** Register a plugin */
  register(plugin: CmsPlugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }
    this.plugins.set(plugin.name, { plugin, active: false });
  }

  /** Activate a registered plugin */
  async activate(name: string, context: PluginContext): Promise<void> {
    const entry = this.plugins.get(name);
    if (!entry) throw new Error(`Plugin "${name}" not found`);
    if (entry.active) return;
    await entry.plugin.activate?.(context);
    entry.active = true;
  }

  /** Deactivate a plugin */
  async deactivate(name: string, context: PluginContext): Promise<void> { /* ... */ }

  /** Get all active content hooks (merged) */
  getContentHooks(): ContentHooks { /* merge all active plugins' contentHooks */ }

  /** Get all active build hooks (chained) */
  getBuildHooks(): BuildHooks { /* chain all active plugins' buildHooks */ }

  /** Get all active AI hooks (chained) */
  getAiHooks(): AiHooks { /* chain all active plugins' aiHooks */ }

  /** Get all custom field types from active plugins */
  getCustomFields(): CustomFieldType[] { /* ... */ }

  /** Get all custom block types from active plugins */
  getCustomBlocks(): CustomBlockType[] { /* ... */ }
}
```

### 8. Registration in cms.config.ts

```typescript
// cms.config.ts
import { defineConfig } from "@webhouse/cms";
import analyticsPlugin from "@webhouse/cms-plugin-analytics";
import seoPlugin from "@webhouse/cms-plugin-seo";

export default defineConfig({
  plugins: [
    analyticsPlugin({ trackingId: "G-XXXXXX" }),
    seoPlugin({ autoMeta: true }),
  ],
  collections: [ /* ... */ ],
});
```

### 9. Plugin State Persistence

```
_data/plugins.json
```

```json
{
  "installed": {
    "@webhouse/cms-plugin-analytics": {
      "version": "1.0.0",
      "active": true,
      "installedAt": "2026-03-16T10:00:00Z",
      "config": { "trackingId": "G-XXXXXX" }
    }
  }
}
```

### 10. Build Pipeline Integration

Modify `packages/cms/src/build/pipeline.ts` to call build hooks:

```typescript
// In runBuild():
const buildHooks = pluginRegistry.getBuildHooks();

// Phase 2: Render (modified)
let pages = await renderSite(context);
for (const page of pages) {
  page = await buildHooks.beforeRender?.(page, buildContext) ?? page;
}
// ... render ...
for (const page of renderedPages) {
  page.html = await buildHooks.afterRender?.(page.html, page, buildContext) ?? page.html;
}

// Phase 3: Output (modified)
renderedPages = await buildHooks.beforeOutput?.(renderedPages, buildContext) ?? renderedPages;
writeOutput(renderedPages, { outDir });
await buildHooks.afterBuild?.(result, buildContext);
```

## Impact Analysis

### Files affected
- `packages/cms/src/plugins/types.ts` — new plugin type definitions
- `packages/cms/src/plugins/registry.ts` — new plugin registry
- `packages/cms/src/schema/types.ts` — add `plugins` array to `CmsConfig`
- `packages/cms/src/content/service.ts` — merge plugin content hooks
- `packages/cms/src/build/pipeline.ts` — add build hook calls
- `packages/cms-ai/src/agents/content.ts` — add AI hook calls

### Blast radius
- Content service, build pipeline, and AI agent all modified — core systems
- Plugin hooks run in sequence — slow plugins affect all operations
- CmsConfig schema change affects all config consumers

### Breaking changes
- `CmsConfig` gains `plugins` array — optional, so backwards-compatible

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Plugin activates and deactivates correctly
- [ ] Content hooks fire on document create/update/delete
- [ ] Build hooks modify rendered output
- [ ] Custom field types render in admin editor
- [ ] Example plugin works end-to-end

## Implementation Steps

1. **Define plugin types** — `CmsPlugin`, `PluginContext`, `BuildHooks`, `AiHooks`, `CustomFieldType`, `CustomBlockType` in `packages/cms/src/plugins/types.ts`
2. **Implement `PluginRegistry`** — registration, activation, deactivation, hook merging
3. **Add `plugins` array to `CmsConfig`** in `packages/cms/src/schema/types.ts`
4. **Wire content hooks** — merge plugin contentHooks with existing ContentHooks in `ContentService`
5. **Wire build hooks** — add beforeRender/afterRender/beforeOutput/afterBuild calls to `packages/cms/src/build/pipeline.ts`
6. **Wire AI hooks** — add beforeGenerate/afterGenerate calls to `packages/cms-ai/src/agents/content.ts`
7. **Implement custom field type registration** — admin UI dynamically loads field components
8. **Implement custom block type registration** — admin UI discovers plugin-provided blocks
9. **Add plugin state persistence** — `_data/plugins.json` for installed/active state
10. **Create example plugin** — `@webhouse/cms-plugin-reading-time` (adds estimated reading time to posts)
11. **Test** — install, activate, deactivate, uninstall lifecycle; verify hooks fire correctly

## Dependencies

- **Content hooks** — `packages/cms/src/content/hooks.ts` (existing, extended)
- **Build pipeline** — `packages/cms/src/build/pipeline.ts` (existing, modified)
- **AI agents** — `packages/cms-ai/src/agents/content.ts` (existing, modified)
- **CmsConfig schema** — `packages/cms/src/schema/types.ts` (existing, extended)

## Effort Estimate

**Large** — 5-7 days

- Day 1-2: Plugin types, PluginRegistry, config integration
- Day 3: Content hook wiring, build hook wiring
- Day 4: AI hook wiring, custom field types
- Day 5: Custom block types, plugin state persistence
- Day 6-7: Example plugin, admin UI for plugin management, testing
