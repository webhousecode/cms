/**
 * F109 — Inline Proofreading Plugin
 *
 * TipTap Extension that manages ProseMirror Decorations for inline
 * spelling/grammar corrections. Renders strikethrough on errors with
 * green suggestion widgets. Non-destructive — decorations don't modify
 * the document until the user explicitly accepts.
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

// Use inline type — prosemirror-model is not a direct dependency
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProseMirrorNode = any;

/* ─── Types ────────────────────────────────────────────────────── */

export interface ProofreadMatch {
  id: string;
  from: number; // ProseMirror position
  to: number; // ProseMirror position
  original: string;
  suggestion: string;
  reason: string;
  type: "spelling" | "grammar" | "style";
}

interface ProofreadState {
  matches: ProofreadMatch[];
  activeId: string | null;
  decorations: DecorationSet;
}

/* ─── Plugin Key ───────────────────────────────────────────────── */

export const proofreadKey = new PluginKey<ProofreadState>("proofread");

/* ─── Offset Mapping ───────────────────────────────────────────── */

/**
 * Maps a plain-text character offset to a ProseMirror document position.
 * The AI returns offsets in the getText() output — we need to convert
 * those to positions that account for node boundaries.
 */
export function textOffsetToPos(doc: ProseMirrorNode, textOffset: number): number {
  let charCount = 0;
  let result = -1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc.descendants((node: any, pos: number) => {
    if (result !== -1) return false;
    if (node.isText) {
      const text = node.text ?? "";
      if (charCount + text.length > textOffset) {
        result = pos + (textOffset - charCount);
        return false;
      }
      charCount += text.length;
    } else if (node.isBlock && node.type.name !== "doc" && charCount > 0) {
      // getText() inserts \n between blocks
      charCount += 1;
    }
    return undefined;
  });

  return result === -1 ? 0 : result;
}

/* ─── Build Decorations ────────────────────────────────────────── */

function buildDecorations(
  doc: ProseMirrorNode,
  matches: ProofreadMatch[],
  activeId: string | null
): DecorationSet {
  if (matches.length === 0) return DecorationSet.empty;

  const decorations: Decoration[] = [];

  for (const m of matches) {
    // Inline decoration: strikethrough on original text
    decorations.push(
      Decoration.inline(m.from, m.to, {
        class: `proofread-error${m.id === activeId ? " proofread-active" : ""}`,
        "data-proofread-id": m.id,
      })
    );

    // Widget decoration: suggestion text after the error
    const widget = document.createElement("span");
    widget.className = `proofread-suggestion${m.id === activeId ? " proofread-active" : ""}`;
    widget.textContent = ` ${m.suggestion}`;
    widget.dataset.proofreadId = m.id;
    widget.title = `${m.type}: ${m.reason}`;

    decorations.push(
      Decoration.widget(m.to, () => widget, {
        key: `suggestion-${m.id}`,
        side: 1,
      })
    );
  }

  return DecorationSet.create(doc, decorations);
}

/* ─── TipTap Extension ─────────────────────────────────────────── */

export const ProofreadPlugin = Extension.create({
  name: "proofread",

  addProseMirrorPlugins() {
    return [
      new Plugin<ProofreadState>({
        key: proofreadKey,
        state: {
          init: (_, { doc }): ProofreadState => ({
            matches: [],
            activeId: null,
            decorations: DecorationSet.create(doc, []),
          }),

          apply(tr, prev): ProofreadState {
            const meta = tr.getMeta(proofreadKey);

            if (meta?.type === "set") {
              const matches = meta.matches as ProofreadMatch[];
              const activeId = matches[0]?.id ?? null;
              return {
                matches,
                activeId,
                decorations: buildDecorations(tr.doc, matches, activeId),
              };
            }

            if (meta?.type === "activate") {
              return {
                ...prev,
                activeId: meta.id as string,
                decorations: buildDecorations(tr.doc, prev.matches, meta.id as string),
              };
            }

            if (meta?.type === "remove") {
              const matches = prev.matches.filter((m) => m.id !== meta.id);
              const activeId =
                matches.length > 0
                  ? matches[0].id
                  : null;
              return {
                matches,
                activeId,
                decorations: buildDecorations(tr.doc, matches, activeId),
              };
            }

            if (meta?.type === "clear") {
              return {
                matches: [],
                activeId: null,
                decorations: DecorationSet.empty,
              };
            }

            // Map decorations through document changes (e.g., accept edits shift positions)
            if (tr.docChanged && prev.matches.length > 0) {
              const mapped = prev.matches.map((m) => ({
                ...m,
                from: tr.mapping.map(m.from, 1),
                to: tr.mapping.map(m.to, -1),
              }));
              return {
                ...prev,
                matches: mapped,
                decorations: buildDecorations(tr.doc, mapped, prev.activeId),
              };
            }

            return prev;
          },
        },

        props: {
          decorations(state) {
            return proofreadKey.getState(state)?.decorations ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
