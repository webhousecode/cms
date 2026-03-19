# F18 — Design System & Themes

> AI-powered theme generation from brand colors and fonts with a component library.

## Problem

Sites built with the CMS have no design system. Every project starts from scratch with CSS. There is no way to generate a consistent visual design from brand inputs or provide reusable components.

## Solution

A generative design system where users input brand colors and fonts, and AI generates a complete theme (CSS variables, Tailwind config, component styles). Includes a component library for common patterns and an infographic engine for data visualization.

## Technical Design

### Theme Configuration

```typescript
// packages/cms/src/schema/types.ts — extend CmsConfig

export interface ThemeConfig {
  colors: {
    primary: string;        // hex
    secondary?: string;
    accent?: string;
    background?: string;
    foreground?: string;
  };
  fonts: {
    heading?: string;       // font family name
    body?: string;
  };
  borderRadius?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  style?: 'minimal' | 'corporate' | 'playful' | 'editorial';
}

// In CmsConfig:
theme?: ThemeConfig;
```

### Theme Generator

```typescript
// packages/cms-ai/src/agents/theme.ts

export class ThemeAgent {
  async generateTheme(config: ThemeConfig): Promise<{
    cssVariables: Record<string, string>;  // --color-primary: #F7BB2E
    tailwindConfig: string;                 // tailwind.config.ts content
    globalCss: string;                      // base styles
  }>;

  async generateComponentStyles(
    component: 'card' | 'hero' | 'nav' | 'footer' | 'button' | 'form',
    theme: ThemeConfig
  ): Promise<string>;  // Tailwind CSS classes
}
```

### Component Library

```typescript
// packages/cms/src/template/components/
// Each component is a .tsx file with Tailwind classes using CSS variables

export interface ComponentVariant {
  name: string;
  label: string;
  preview: string;     // HTML preview snippet
  code: string;         // React component code
  cssVars: string[];    // which CSS variables it uses
}

// Components: card, hero, nav, footer, feature-grid, testimonial,
// pricing-table, cta-banner, team-grid, stats-bar
```

### Infographic Engine

```typescript
// packages/cms/src/template/infographic.ts

export class InfographicEngine {
  /** Generate SVG infographic from data */
  async generate(data: {
    type: 'bar' | 'pie' | 'timeline' | 'comparison' | 'stats';
    title: string;
    items: Array<{ label: string; value: number; color?: string }>;
  }, theme: ThemeConfig): Promise<string>;  // SVG string
}
```

### Admin UI

- Theme editor at `/admin/settings/brand-voice` (extend existing brand voice page)
- Color picker, font selector, style preset selector
- Live preview panel showing components with current theme
- "Generate Theme" button that uses AI to create complementary colors
- Component gallery with copy-to-clipboard code snippets

## Impact Analysis

### Files affected
- `packages/cms/src/schema/types.ts` — add `ThemeConfig` to `CmsConfig`
- `packages/cms-ai/src/agents/theme.ts` — new theme generation agent
- `packages/cms/src/template/components/` — new component templates
- `packages/cms-admin/src/app/admin/settings/brand-voice/` — extend brand voice page

### Blast radius
- `CmsConfig` type extension — must be optional to not break existing configs
- Brand voice settings page modified — test existing brand voice functionality

### Breaking changes
- None — `theme` config is optional

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Theme generator produces valid CSS variables
- [ ] Tailwind config generator outputs valid config
- [ ] Component gallery renders with current theme
- [ ] Existing brand voice settings unaffected

## Implementation Steps

1. Add `ThemeConfig` to `CmsConfig` in `packages/cms/src/schema/types.ts`
2. Create `packages/cms-ai/src/agents/theme.ts` with theme generation
3. Build CSS variable generator from theme config
4. Build Tailwind config generator
5. Create component templates in `packages/cms/src/template/components/`
6. Build theme editor UI extending the existing brand voice settings page
7. Add live preview panel with component rendering
8. Create infographic engine with SVG generation
9. Add "Export Tailwind Config" button that writes `tailwind.config.ts`
10. Document component usage in site templates

## Dependencies

- Existing brand voice settings at `packages/cms-admin/src/app/admin/settings/brand-voice/`

## Effort Estimate

**Large** — 6-8 days
