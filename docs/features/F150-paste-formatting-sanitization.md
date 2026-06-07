# F150 — Paste formatting sanitization (richtext editor)

**Status:** In progress
**Owner:** cms-admin
**Created:** 2026-06-07

## Motivation / problem

When an editor pastes text from Microsoft Word / Office (and some other rich sources) into a CMS richtext field, the clipboard HTML carries hidden "cruft": empty `<span>` wrappers, `mso-*` inline styles, `<o:p>`, `<font>`, Office conditional comments and XML-namespace tags. The TipTap editor normalizes these *visually* (so the editor looks fine), but because the editor serializes to Markdown with `html: true`, the raw cruft round-trips into the **stored content**. On public sites that render the stored Markdown without raw-HTML support (e.g. react-markdown without rehype-raw), the wrappers escape and show up as **literal `<span>` text on the live page**.

Ground truth: sanneandersen.dk product description "fordjelsen" — every Word-pasted paragraph stored as `<span>*markdown*</span>`, leaking `<span>` onto the public page. The site applied a defensive render-side strip, but the correct fix is at the **source**: the CMS editor should never store the cruft in the first place — fixing it once for *every* site built on the CMS.

Verified current state: no `transformPastedHTML`, no plain-paste handler, no clear-formatting button. Only `transformPastedText: true` (markdown plain-text paste) + `TextStyle`/`Color` extensions which keep `<span style>` marks alive, letting Office spans round-trip via `html:true`.

## Scope

### In scope
1. **Auto-sanitize on paste** — a pure, string-based sanitizer wired into the editor's `transformPastedHTML`, run on every paste *before* ProseMirror parses. Removes Office/Word cruft: namespace tags (`<o:p>`, `<w:…>`, …), `<font>` tags, Office conditional comments, `mso-*` style properties, `class="Mso…"`, and unwraps attribute-less (styling-only) `<span>` wrappers — while preserving all real content and intentional formatting between them.
2. **"Clear formatting" toolbar button** — a one-click control (`unsetAllMarks()` + `clearNodes()` on the selection) so an editor can strip formatting from any selected text, including content already pasted. data-testid `clear-formatting-button`, with hover/active feedback like the rest of the toolbar.

### Non-goals
- Aggressively stripping *all* formatting on every paste (we keep intentional bold/italic/links from legitimate sources; only Office junk is auto-removed). Full strip is available on demand via the button and via the browser-native Cmd+Shift+V plain-paste (already works because the browser delivers text/plain only).
- Stripping non-`mso` inline styles (e.g. a real color the user pasted) — out of scope; only Office-signature cruft is targeted to avoid destroying intent.
- A server-side migration to clean *already-stored* polluted content (separate task if desired; sites can render-strip in the meantime).

## Architecture

- New pure module `packages/cms-admin/src/lib/paste-sanitizer.ts`:
  - `sanitizeWordPasteHtml(html: string): string` — regex/string-based, no DOM dependency (so it runs in the browser paste path AND is unit-testable under the repo's `node` vitest env).
  - Steps: strip Office conditional comments → strip XML-namespace tags → unwrap `<font>` → drop `class="Mso…"` → strip `mso-*` from `style=""` (drop the attribute if it becomes empty) → unwrap attribute-less `<span>` (loop to fixpoint for nesting).
  - Edge guard: spans/elements that retain real attributes (e.g. `style="color:#f00"`) are preserved.
- Wire into `rich-text-editor.tsx` → `editorProps.transformPastedHTML = (html) => sanitizeWordPasteHtml(html)`.
- Toolbar: add a "Clear formatting" button next to the existing inline-format controls.

## Tests (written first)
`packages/cms-admin/src/lib/__tests__/paste-sanitizer.test.ts`:
- Word span-wrapped markdown (the sanneandersen fixture) → spans removed, inner markdown (`*`, `**`, `<u>`) preserved.
- `<o:p></o:p>`, `<font>`, conditional comments, `mso-*` styles, `Mso` classes → removed.
- Edge guards: legit `<span style="color:#f00">` preserved; clean third-party HTML (`<strong>`, `<a href>`, lists) untouched; empty string / plain text unchanged; nested attribute-less spans fully unwrapped.

## Dependencies / risk
- Touches the shared richtext editor used by **all** CMS sites → blast radius is wide, but the sanitizer is additive (only runs on paste; no change to existing stored content, no change to typing). Backwards-compatible.
- No new packages. No schema change. No builtin-block change.

## Rollout
- Ships with cms-admin. Once deployed to webhouse.app, the sanneandersen render-side strip becomes belt-and-suspenders (can stay). Verify with a real Word paste in the editor → saved Markdown has no span/mso cruft.

## Permissions
- "Clear formatting" is an editor content action inside the editor surface — same gating as the rest of the richtext toolbar (available to anyone who can edit content; viewers don't reach the editor). No new permission string required.
