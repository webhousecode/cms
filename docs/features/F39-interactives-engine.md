# F39 — Interactives Engine

> A dedicated system for managing, editing, and embedding interactive content — charts, animations, demos, calculators, and mini-apps — with CMS-managed data separation.

## Problem

Interactive content (Chart.js visualizations, animated diagrams, pricing calculators, interactive demos) is currently impossible to manage in the CMS. These require JavaScript execution, custom CSS, and dynamic data — none of which work in richtext fields. The only current option is hardcoding everything in the site's source code, making it uneditable by non-developers.

## Solution

A first-class "Interactives" system with:

1. **Interactives Manager** — sidebar menu item in admin for uploading, previewing, visual editing, and AI-generating interactive HTML components
2. **Data-driven architecture** — Interactive components READ data from CMS collections, never hardcode text or numbers
3. **Embed system** — Interactives can be embedded in richtext (TipTap node), blocks fields, or as standalone pages
4. **Three editing modes** — Visual Edit (contentEditable injection), AI Edit (chat-to-modify), Code View
5. **Native rendering** — on the site, Interactives render as React components reading CMS data, NO iframes needed

## Architecture

### The Separation Principle

| What | Where | Editable by |
|------|-------|-------------|
| Text labels, headings | CMS text fields | Redaktør i admin |
| Data points, numbers | CMS array/object fields | Redaktør i admin |
| Thresholds, config | CMS number/select fields | Redaktør i admin |
| Visualization, animation | Interactive HTML/JSX | Visual/AI/Code editor |
| Styling, colors | Interactive CSS | Visual/AI editor |

**Rule for AI site builders (CLAUDE.md directive):**
> When building interactive content, ALL natural text elements and data points MUST be stored in CMS collections — never hardcoded in the Interactive. The Interactive READS data from CMS via props, data attributes, or API fetch. Be wildly creative with visualization — Chart.js, D3, GSAP, CSS animations, canvas, WebGL — but data is always CMS-managed.

### Data Flow

```
CMS Collection (sensor-data, chart-config, etc.)
  ↓ getDocument() / getCollection()
Next.js Page (server component)
  ↓ passes data as props
Interactive Component (client component)
  ↓ renders visualization
Browser (Chart.js, D3, animations, etc.)
```

### Example: SproutLake Water Consumption Chart

**CMS Collection: `chart-data`**
```json
{
  "slug": "sow-7b-water-24h",
  "data": {
    "title": "24-Hour Water Consumption",
    "yAxisLabel": "Water Consumption (Liters)",
    "xAxisLabel": "Hour of the Day",
    "readings": [
      { "hour": "12 AM", "value": 1.3 },
      { "hour": "1 AM", "value": 0.9 },
      { "hour": "6 AM", "value": 0.2, "anomaly": "critical" },
      { "hour": "3 PM", "value": 4.15, "anomaly": "warning" }
    ],
    "thresholds": {
      "criticalLow": 0.5,
      "warningHigh": 3.0
    }
  }
}
```

**Interactive Component:**
```tsx
"use client";
import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";

interface WaterChartProps {
  title: string;
  readings: Array<{ hour: string; value: number; anomaly?: string }>;
  yAxisLabel: string;
  thresholds: { criticalLow: number; warningHigh: number };
}

export function WaterConsumptionChart({ title, readings, yAxisLabel, thresholds }: WaterChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const chart = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels: readings.map(r => r.hour),
        datasets: [{
          data: readings.map(r => r.value),
          borderColor: "#22c55e",
          pointBackgroundColor: readings.map(r =>
            r.anomaly === "critical" ? "#ef4444" :
            r.anomaly === "warning" ? "#eab308" : "#22c55e"
          ),
        }]
      },
      // ... Chart.js config
    });
    return () => chart.destroy();
  }, [readings]);

  return (
    <div>
      <h3>{title}</h3>
      <canvas ref={canvasRef} />
    </div>
  );
}
```

**Page usage (no iframe!):**
```tsx
import { getDocument } from "@/lib/content";
import { WaterConsumptionChart } from "@/components/interactives/water-chart";

export default function InfographicPage() {
  const chartData = getDocument("chart-data", "sow-7b-water-24h");

  return (
    <article>
      <h1>AI Anomaly Detection</h1>
      <p>The chart below shows 24 hours of real water consumption data...</p>

      <WaterConsumptionChart
        title={chartData.data.title}
        readings={chartData.data.readings}
        yAxisLabel={chartData.data.yAxisLabel}
        thresholds={chartData.data.thresholds}
      />

      <p>Our AI instantly flags two critical events...</p>
    </article>
  );
}
```

### Interactive Types (examples for CLAUDE.md)

| Type | Tech | CMS Data |
|------|------|----------|
| Line/bar/pie charts | Chart.js, D3 | Data points, labels, colors |
| Animated diagrams | CSS/GSAP | Step labels, descriptions |
| Pricing calculators | Vanilla JS | Prices, tiers, features |
| ROI calculators | Vanilla JS | Formulas, defaults, labels |
| Slide decks | Vanilla JS/CSS | Slides content, images |
| Product demos | Preact | Feature list, screenshots |
| Code playgrounds | Monaco/CodeMirror | Default code, language |
| Data tables | Vanilla JS | Row/column data |
| Timeline/flow | CSS/SVG | Events, dates, descriptions |
| Map visualizations | Leaflet/Mapbox | Coordinates, labels |

### Admin UI: Interactives Manager

```
Sidebar: Interactives (⚡ icon)

┌──────────────────────────────────────────────────────┐
│ INTERACTIVES                                          │
│                                                        │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐          │
│ │ Water  │ │ Energy │ │  RAG   │ │Heating │          │
│ │ Chart  │ │ Chart  │ │ Flow   │ │Profile │          │
│ │ [prev] │ │ [prev] │ │ [prev] │ │ [prev] │          │
│ └────────┘ └────────┘ └────────┘ └────────┘          │
│                                                        │
│ [+ Upload HTML]  [+ Create with AI]                   │
└──────────────────────────────────────────────────────┘

Click to open → 3 edit modes:
├── Visual Edit (contentEditable injection)
├── AI Edit (chat to modify)
└── Code View (syntax highlighted)
```

### Embedding in Content

**TipTap node (richtext):**
New toolbar button "Insert Interactive" → picker showing available Interactives → inserts reference that renders as preview in editor, as component on site.

**Blocks field:**
```typescript
defineBlock({
  name: "interactive",
  label: "Interactive Component",
  fields: [
    { name: "interactiveId", type: "relation", collection: "interactives" },
    { name: "dataSource", type: "relation", collection: "chart-data" },
    { name: "width", type: "select", options: [
      { label: "Full width", value: "full" },
      { label: "Half width", value: "half" },
    ]},
  ],
})
```

**Standalone page (collection):**
The existing Infographics collection with a `type: "interactive"` field pointing to an Interactive from the manager.

## Implementation Steps

### Phase 1: Core Infrastructure
- [x] MediaAdapter interface with filesystem + GitHub implementations
- [x] Interactives Manager page (`/admin/interactives`) with grid/list views
- [x] Upload HTML files, list with thumbnails (Pitch Vault style)
- [x] Preview mode (iframe with `src` pointing to uploaded file)
- [x] Search, grid/list toggle, actions dropdown (Edit/Publish/Clone/Trash)
- [x] Status workflow: draft → published → trashed
- [x] Properties panel with rename (matches document editor)
- [x] Trash integration (soft delete, restore from Trash page)
- [x] GitHub adapter: read/write ints via GitHub API
- [x] Tab title shows interactive name

### Phase 2: Editing
- [x] Visual Edit mode (wysiwyg-inject from Pitch Vault, adapted for CMS admin)
- [x] AI Edit mode — split view: preview + AI chat panel, Apply button extracts HTML from code fences
- [x] Code View mode (Monaco editor with HTML syntax highlighting)
- [x] Clone interactive
- [x] Top bar matches document editor exactly (same Button components, icon sizes)

### Phase 3: Data Separation
- [ ] Define data collections pattern in CLAUDE.md
- [ ] Build Interactive component loader that passes CMS data as props
- [ ] Convert SproutLake infographics to data-driven Interactives

### Phase 4: Embedding
- [x] TipTap `interactiveEmbed` node (toolbar button, picker, preview in editor)
- [x] Block type `interactive` for blocks fields — works via `defineBlock({ name: 'interactive', fields: [{ name: 'interactiveId', type: 'text' }, ...] })` in cms.config.ts, BlocksEditor renders automatically
- [ ] Standalone page rendering (collection with interactive field)
- [ ] Interactive picker field type (browse + select from Interactives Manager instead of text input for interactiveId)

### Phase 5: AI Generation
- [ ] "Create with AI" — prompt → AI generates Interactive HTML
- [ ] AI understands CMS data collections and generates data-reading code
- [ ] Ints generated by agents land in Curation Queue

## Dependencies

- Pitch Vault wysiwyg-inject pattern (reference, not dependency)
- Existing AI chat component (reuse)
- Media upload API (reuse for file storage)

## Effort Estimate

**Large** — 10-14 days total across all phases

Phase 1-2: 4 days (manager + editing)
Phase 3: 3 days (data separation + component loader)
Phase 4: 2 days (TipTap node + block type)
Phase 5: 2 days (AI generation)
SproutLake conversion: 2 days
