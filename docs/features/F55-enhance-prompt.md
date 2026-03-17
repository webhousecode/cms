# F55 — Enhance Prompt

> One-click prompt improvement that rewrites vague user instructions into detailed, effective AI prompts before sending.

## Problem

Users write casual, incomplete prompts like *"make the sliders work"* or *"add some animations"*. The AI then guesses at intent, produces partial results, and the user has to iterate multiple times. This wastes tokens (expensive with Sonnet) and time.

The gap between what the user *means* and what they *write* is where most AI interaction failures happen. A pricing calculator with non-functional sliders needs a very specific prompt to fix — the user shouldn't have to be a prompt engineer to get good results.

Examples of prompts that fail today vs. what would succeed:

| User writes | What the AI needs |
|---|---|
| "make the sliders work" | "Add JavaScript event listeners to all `<input type="range">` elements. Each slider should update its adjacent `.slider-value` display in real-time. The `updateCalculator()` function should recalculate all pricing line items and update the total when any slider changes." |
| "add dark mode" | "Add a dark mode toggle button in the top-right corner. Use CSS custom properties for all colors. When toggled, add class `dark` to `<body>` which inverts the color scheme. Persist choice in localStorage." |
| "fix the chart" | "The Chart.js line chart is not rendering because the canvas element has no data. Wire the `readings` array to `chart.data.datasets[0].data`, map `hour` to labels, and call `chart.update()` after data assignment." |

## Solution

A **magic wand button** (Sparkles icon) next to the Send button in all AI input fields. Clicking it sends the user's rough prompt to a fast model (Haiku) with a meta-prompt that rewrites it into a detailed, context-aware instruction. The enhanced prompt replaces the textarea content so the user can review, tweak, and then send.

Key principles:
- **Fast and cheap** — uses Haiku (not Sonnet), takes 1-2 seconds
- **Transparent** — shows the enhanced prompt for review, never auto-sends
- **Context-aware** — for Interactive editing, the enhancer sees the current HTML structure (tag names, IDs, class names) to produce specific selectors and references

## Technical Design

### Enhance API Endpoint

New endpoint that takes a rough prompt + optional context summary and returns an enhanced version:

```typescript
// packages/cms-admin/src/app/api/cms/ai/enhance-prompt/route.ts

POST /api/cms/ai/enhance-prompt
{
  prompt: string;           // User's rough prompt
  context: "interactive" | "content" | "general";
  htmlSummary?: string;     // Compact summary of the HTML structure (for interactives)
}
→ { enhanced: string }
```

The endpoint uses Haiku with `max_tokens: 512` (the enhanced prompt itself is short) and a meta-system-prompt:

```typescript
const META_PROMPT = `You are a prompt engineer. Rewrite the user's vague instruction into a detailed, specific prompt for an AI code editor.

Rules:
- Be specific: reference element types, IDs, class names, function names from the context
- Be complete: describe the expected behavior, not just "make it work"
- Be actionable: the AI should know exactly what to build/change
- Keep it concise: 2-4 sentences max, no fluff
- Output ONLY the enhanced prompt, nothing else

Context type: {context}
{htmlSummary}`;
```

### HTML Summary Extraction (for Interactives)

Instead of sending the full 14KB HTML to the enhancer (wasteful for Haiku), extract a compact structural summary:

```typescript
// packages/cms-admin/src/lib/html-summary.ts

export function extractHtmlSummary(html: string): string {
  // Extract: element IDs, class names, script function names, event handlers
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  const functions = [...html.matchAll(/function\s+(\w+)/g)].map(m => m[1]);
  const inputs = [...html.matchAll(/<input[^>]*type="([^"]+)"[^>]*>/g)].map(m => m[0]);
  const eventHandlers = [...html.matchAll(/on\w+="([^"]+)"/g)].map(m => m[1]);

  return `HTML structure:
- Element IDs: ${ids.join(", ")}
- JS functions: ${functions.join(", ")}
- Inputs: ${inputs.length} (${inputs.map(i => i.match(/type="(\w+)"/)?.[1]).join(", ")})
- Event handlers: ${eventHandlers.length} bound`;
}
```

### UI Component — Enhance Button

A reusable button placed in the textarea input area:

```typescript
// packages/cms-admin/src/components/ui/enhance-prompt-button.tsx

interface Props {
  prompt: string;
  context: "interactive" | "content" | "general";
  htmlContent?: string;           // Full HTML for summary extraction
  onEnhanced: (enhanced: string) => void;
}

export function EnhancePromptButton({ prompt, context, htmlContent, onEnhanced }: Props) {
  // Shows Sparkles icon, loading spinner while enhancing
  // Calls /api/cms/ai/enhance-prompt
  // Calls onEnhanced() with the result → parent replaces textarea content
}
```

### Integration Points

**1. Interactive AI Edit panel** (`interactive-ai-panel.tsx`):
```
[textarea: "make the sliders work"]  [✨] [➤]
                                      ^
                                  Enhance button
```
- Context: `"interactive"`
- Passes `htmlContent` for summary extraction
- Enhanced prompt replaces textarea content

**2. Create with AI modal** (`interactives/page.tsx`):
```
[textarea: "pricing calculator"]  [✨ Enhance]
```
- Context: `"interactive"`
- No existing HTML (creation, not editing)

**3. Content AI chat** (field editor AI panel):
```
[textarea: "write an intro"]  [✨] [➤]
```
- Context: `"content"`
- Passes collection name + field type as context

### Editable Meta-Prompt

Add to `DEFAULT_PROMPTS` in `ai-prompts.ts`:

```typescript
"enhance-prompt": {
  label: "Enhance Prompt — Meta Prompt",
  description: "System prompt for the prompt enhancer. Rewrites vague instructions into specific AI prompts.",
  default: `You are a prompt engineer...`
}
```

Editable in Settings → AI Prompts like all other prompts.

## Implementation Steps

1. **`html-summary.ts`** — Extract compact structural summary from HTML (IDs, functions, inputs)
2. **`/api/cms/ai/enhance-prompt` route** — Haiku call with meta-prompt, returns enhanced text
3. **`enhance-prompt` in `DEFAULT_PROMPTS`** — Editable meta-prompt in Settings → AI Prompts
4. **`EnhancePromptButton` component** — Reusable button with loading state
5. **Integrate in Interactive AI panel** — Add button next to Send, pass HTML content
6. **Integrate in Create with AI modal** — Add button next to Generate
7. **Integrate in content AI chat** — Add button next to Send (lower priority, shorter prompts)

## Dependencies

- Existing AI chat infrastructure (`/api/cms/ai/chat` or similar)
- Anthropic API key configured (or F54 Local AI Tunnel)

## Effort Estimate

**Small** — 1-2 days

- Day 1: API endpoint + EnhancePromptButton + Interactive AI panel integration
- Day 2: Create modal + content chat integration + editable meta-prompt + testing
