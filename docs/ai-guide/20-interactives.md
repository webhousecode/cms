<!-- @webhouse/cms ai-guide v0.3.0 — last updated 2026-03-23 -->

# Data-Driven Interactives

## Data-Driven Interactives

When building interactive content (charts, animations, calculators, demos), **ALL natural text and data MUST be stored in CMS collections — never hardcoded in the Interactive component.** The Interactive reads data from CMS via props passed from a server component.

### The Separation Principle

| What | Where | Editable by |
|------|-------|-------------|
| Text labels, headings | CMS text fields | Editor in admin |
| Data points, numbers | CMS array/object fields | Editor in admin |
| Thresholds, config values | CMS number/select fields | Editor in admin |
| Visualization, animation | Interactive component | Visual/AI/Code editor |
| Styling, colors | Interactive CSS | Visual/AI editor |

**Rule:** Be wildly creative with visualization — Chart.js, D3, GSAP, CSS animations, Canvas, WebGL — but data is always CMS-managed.

### Pattern: CMS Collection → Page → Interactive Component

**Step 1: Define a data collection in `cms.config.ts`**

```typescript
defineCollection({
  name: "chart-data",
  label: "Chart Data",
  fields: [
    { name: "title", type: "text", required: true },
    { name: "chartType", type: "select", options: [
      { label: "Line", value: "line" },
      { label: "Bar", value: "bar" },
      { label: "Pie", value: "pie" },
    ]},
    { name: "yAxisLabel", type: "text" },
    { name: "xAxisLabel", type: "text" },
    { name: "dataPoints", type: "array", label: "Data Points" },
    { name: "thresholds", type: "object", label: "Thresholds" },
  ],
})
```

**Step 2: Create the Interactive component (client component)**

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
          label: yAxisLabel,
          data: readings.map(r => r.value),
          borderColor: "#22c55e",
          pointBackgroundColor: readings.map(r =>
            r.anomaly === "critical" ? "#ef4444" :
            r.anomaly === "warning" ? "#eab308" : "#22c55e"
          ),
        }]
      },
    });
    return () => chart.destroy();
  }, [readings, yAxisLabel]);

  return (
    <div>
      <h3>{title}</h3>
      <canvas ref={canvasRef} />
    </div>
  );
}
```

**Step 3: Use in a page (server component reads CMS, passes props)**

```tsx
import { getDocument } from "@/lib/content";
import { WaterConsumptionChart } from "@/components/interactives/water-chart";

export default function InfographicPage() {
  const chartData = getDocument("chart-data", "sow-7b-water-24h");
  if (!chartData) return null;

  return (
    <article>
      <WaterConsumptionChart
        title={chartData.data.title}
        readings={chartData.data.dataPoints}
        yAxisLabel={chartData.data.yAxisLabel}
        thresholds={chartData.data.thresholds}
      />
    </article>
  );
}
```

### Standalone HTML Interactives

For simpler cases, the CMS also supports standalone HTML interactives managed via the Interactives Manager in admin. These are complete HTML files with inline CSS/JS that render in iframes. Use these when:

- The interactive is self-contained and doesn't need CMS data
- You want quick prototyping with AI generation ("Create with AI" in admin)
- The interactive is a one-off visualization

For data-driven interactives that need CMS-managed content, always prefer the React component pattern above.

### Scaled Interactive Rendering (Blocks)

The built-in `interactive` block supports viewport scaling — render a full-size interactive as a miniature without scrollbars:

```tsx
case "interactive": {
  const intId = block.interactiveId as string;
  if (!intId) return null;
  const vw = (block.viewportWidth as number) || 1000;  // Internal viewport width
  const vh = (block.viewportHeight as number) || 800;   // Internal viewport height
  const sc = ((block.scale as number) || 100) / 100;    // Scale factor (50 = half size)
  const isScaled = sc < 1;
  return (
    <div key={index} className="my-8">
      {isScaled ? (
        <div style={{ width: vw * sc, height: vh * sc, overflow: "hidden", borderRadius: "0.75rem" }}>
          <iframe
            src={`/interactives/${intId}.html`}
            title={block.caption as string || "Interactive"}
            style={{ width: vw, height: vh, border: "none", transform: `scale(${sc})`, transformOrigin: "top left" }}
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      ) : (
        <iframe
          src={`/interactives/${intId}.html`}
          title={block.caption as string || "Interactive"}
          style={{ width: "100%", minHeight: `${vh}px`, border: "none", borderRadius: "0.75rem" }}
          sandbox="allow-scripts allow-same-origin"
        />
      )}
      {block.caption && (
        <p className="text-sm text-gray-500 mt-2 text-center">{block.caption as string}</p>
      )}
    </div>
  );
}
```

**Example:** `viewportWidth: 1000`, `viewportHeight: 800`, `scale: 50` → renders a 500x400px miniature of the full 1000x800 interactive. All sliders, buttons, and charts remain functional.
