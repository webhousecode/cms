"use client";

import { useEditor, EditorContent, useEditorState, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { AIBubbleMenu } from "./ai-bubble-menu";
import type { NodeViewProps } from "@tiptap/react";
import { Node as TipTapNode, Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "prosemirror-state";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TipTapLink from "@tiptap/extension-link";
import TipTapImage from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Markdown } from "tiptap-markdown";
import { useEffect, useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  IconBold, IconItalic, IconStrikethrough, IconCode,
  IconBulletList, IconNumberedList, IconBlockquote,
  IconUndo, IconRedo, IconChevronDown, IconCheck,
  IconLink, IconTable, IconImage, IconBlocks,
  IconAlignLeft, IconAlignCenter, IconAlignRight, IconTrash, IconMaximize,
  IconHorizontalRule, IconVideo,
} from "./editor-icons";

interface Props {
  value: string;
  onChange: (val: unknown) => void;
  disabled?: boolean;
}

type HeadingKey = "paragraph" | "h1" | "h2" | "h3";

const HEADING_OPTIONS: { key: HeadingKey; label: string; fontSize: string; fontWeight: string }[] = [
  { key: "paragraph", label: "Normal text", fontSize: "14px", fontWeight: "400" },
  { key: "h1",        label: "Heading 1",   fontSize: "26px", fontWeight: "700" },
  { key: "h2",        label: "Heading 2",   fontSize: "20px", fontWeight: "700" },
  { key: "h3",        label: "Heading 3",   fontSize: "16px", fontWeight: "600" },
];

/* ─── Confirm-delete hook ───────────────────────────────────────── */
function useConfirmDelete(onDelete: () => void, timeout = 3500) {
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const request = () => {
    setConfirming(true);
    timer.current = setTimeout(() => setConfirming(false), timeout);
  };
  const confirm = () => {
    if (timer.current) clearTimeout(timer.current);
    onDelete();
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    setConfirming(false);
  };
  return { confirming, request, confirm, cancel };
}

/* ─── Context toolbar button + separator (shared by NodeViews + main toolbar) ── */
function CtxBtn({ title, active, danger, onClick, children }: {
  title: string; active?: boolean; danger?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: "28px", height: "28px", borderRadius: "6px", border: "none",
        cursor: "pointer", transition: "background 120ms",
        backgroundColor: active ? "rgba(255,255,255,0.12)" : "transparent",
        color: danger ? "var(--destructive)" : active ? "var(--foreground)" : "var(--muted-foreground)",
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.07)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = active ? "rgba(255,255,255,0.12)" : "transparent"; }}
    >
      {children}
    </button>
  );
}

/* ─── Shared drag handle ────────────────────────────────────────── */
// data-drag-handle tells ProseMirror to only start node-drag when mousedown
// originates here. TipTap sets draggable="true" on the NodeViewWrapper root
// automatically when the node spec has draggable: true.
function DragHandle() {
  return (
    <div
      data-drag-handle
      contentEditable={false}
      className="drag-handle"
      style={{
        position: "absolute",
        left: "-22px",
        top: "50%",
        transform: "translateY(-50%)",
        width: "16px",
        height: "22px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "grab",
        borderRadius: "3px",
        userSelect: "none",
        color: "var(--muted-foreground)",
        opacity: 0,
        transition: "opacity 120ms",
      }}
    >
      <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor">
        <circle cx="2" cy="2"  r="1.4"/>
        <circle cx="6" cy="2"  r="1.4"/>
        <circle cx="2" cy="7"  r="1.4"/>
        <circle cx="6" cy="7"  r="1.4"/>
        <circle cx="2" cy="12" r="1.4"/>
        <circle cx="6" cy="12" r="1.4"/>
      </svg>
    </div>
  );
}

/* ─── Text drag-and-drop ────────────────────────────────────────── */
const TextDragDrop = Extension.create({
  name: "textDragDrop",
  priority: 200,
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("textDragDrop"),
        props: {
          handleDOMEvents: {
            mousedown(view, event) {
              if (event.button !== 0) return false;
              const { selection } = view.state;
              if (selection.empty) return false;
              const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
              if (!pos || pos.pos < selection.from || pos.pos > selection.to) return false;

              // Click is inside existing selection — initiate drag instead of re-selecting
              const dom = view.dom as HTMLElement;
              dom.draggable = true;

              const onDragStart = (e: DragEvent) => {
                const slice = view.state.selection.content();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (view as any).dragging = { slice, move: !e.altKey };
                dom.draggable = false;
                dom.removeEventListener("dragstart", onDragStart);
                dom.removeEventListener("mouseup", onMouseUp);
              };
              const onMouseUp = () => {
                dom.draggable = false;
                dom.removeEventListener("dragstart", onDragStart);
                dom.removeEventListener("mouseup", onMouseUp);
              };
              dom.addEventListener("dragstart", onDragStart);
              dom.addEventListener("mouseup", onMouseUp);
              return false;
            },
          },
        },
      }),
    ];
  },
});

/* ─── Resizable Image NodeView ─────────────────────────────────── */
function ImageNodeView({ node, updateAttributes, selected }: NodeViewProps) {
  const { src, alt, width, align } = node.attrs as {
    src: string; alt: string | null; width: string | null; align: "left" | "center" | "right" | null;
  };
  const imgRef = useRef<HTMLImageElement>(null);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startX.current = e.clientX;
    startWidth.current = imgRef.current?.offsetWidth ?? 300;
    const onMouseMove = (ev: MouseEvent) => {
      const newWidth = Math.max(80, startWidth.current + (ev.clientX - startX.current));
      updateAttributes({ width: `${Math.round(newWidth)}px` });
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const currentAlign = align ?? "center";
  // Width is only set when user explicitly resizes via the drag handle.
  // Alignment never changes the displayed size in the editor.
  const effectiveWidth = width ?? "100%";

  const wrapperStyle: React.CSSProperties = currentAlign === "left"
    ? { float: "left", margin: "0.5rem 1.25rem 0.5rem 0" }
    : currentAlign === "right"
    ? { float: "right", margin: "0.5rem 0 0.5rem 1.25rem" }
    : { display: "flex", justifyContent: "center", margin: "0.5rem 0", clear: "both" };

  return (
    <NodeViewWrapper draggable style={{ ...wrapperStyle, position: "relative" }}>
      <DragHandle />
      <div style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}>
        <img
          ref={imgRef}
          src={src}
          alt={alt ?? ""}
          draggable={false}
          style={{
            width: effectiveWidth,
            maxWidth: "100%",
            display: "block",
            borderRadius: "0.375rem",
            outline: selected ? "2px solid var(--primary)" : "none",
            outlineOffset: "2px",
          }}
        />
        {selected && (
          <div
            title="Træk for at ændre størrelse"
            onMouseDown={handleResizeMouseDown}
            style={{
              position: "absolute", bottom: "4px", right: "4px",
              width: "16px", height: "16px", cursor: "se-resize", zIndex: 20,
              borderRadius: "3px", display: "flex", alignItems: "center", justifyContent: "center",
              backgroundColor: "var(--background)", border: "1px solid var(--border)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
            }}
          >
            <svg width="8" height="8" viewBox="0 0 8 8">
              <circle cx="6" cy="2" r="1" fill="currentColor" opacity="0.5" />
              <circle cx="2" cy="6" r="1" fill="currentColor" opacity="0.5" />
              <circle cx="6" cy="6" r="1" fill="currentColor" opacity="0.5" />
            </svg>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

/* ─── ResizableImage extension ──────────────────────────────────── */
const ResizableImage = TipTapImage.extend({
  draggable: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: el => (el as HTMLImageElement).style.width || (el as HTMLImageElement).getAttribute("width") || null,
        renderHTML: attrs => attrs.width ? { style: `width: ${attrs.width}`, width: attrs.width } : {},
      },
      align: {
        default: "center",
        parseHTML: el => (el as HTMLElement).getAttribute("data-align") ?? (el as HTMLElement).getAttribute("data-float") ?? "center",
        renderHTML: attrs => ({ "data-align": attrs.align ?? "center" }),
      },
    };
  },
  addStorage() {
    return {
      markdown: {
        // Serialize align + width into the markdown title field:
        // ![alt](url "float:left|width:300px")
        serialize(state: { write: (s: string) => void; closeBlock: (node: unknown) => void; esc: (s: string) => string }, node: { attrs: Record<string, string> }) {
          const { src, alt, align, width } = node.attrs;
          let title = "";
          if (align === "left" || align === "right") {
            title = `float:${align}`;
            if (width) title += `|width:${width}`;
          } else if (width) {
            title = `width:${width}`;
          }
          const titleStr = title ? ` "${title}"` : "";
          state.write(`![${state.esc(alt || "")}](${(src || "").replace(/[()]/g, "\\$&")}${titleStr})`);
          state.closeBlock(node);
        },
        parse: {
          // When loading from markdown, extract float/width from the image title attr
          // that markdown-it parsed and set them as data-align / style.width so parseHTML picks them up.
          updateDOM(dom: Element) {
            dom.querySelectorAll("img[title]").forEach((el) => {
              const img = el as HTMLImageElement;
              const title = img.getAttribute("title") ?? "";
              const floatMatch = title.match(/float:(left|right)/);
              const widthMatch = title.match(/width:([^|]+)/);
              if (floatMatch) img.setAttribute("data-align", floatMatch[1]);
              if (widthMatch) img.style.width = widthMatch[1].trim();
            });
          },
        },
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});

/* ─── Block Marker node + NodeView ──────────────────────────── */
function BlockMarkerView({ node, deleteNode, editor, getPos }: NodeViewProps) {
  const { slug, label } = node.attrs as { slug: string; label: string };
  const del = useConfirmDelete(deleteNode);

  const handleDoubleClick = () => {
    const pos = typeof getPos === "function" ? getPos() : null;
    if (pos !== null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (editor.storage.blockMarker as any).openPicker?.(pos);
    }
  };

  const btnSm: React.CSSProperties = {
    fontSize: "0.7rem", padding: "0.15rem 0.4rem", borderRadius: "3px",
    border: "1px solid var(--border)", cursor: "pointer", background: "transparent",
    color: "var(--foreground)", lineHeight: 1,
  };

  return (
    <NodeViewWrapper draggable contentEditable={false} style={{ position: "relative" }}>
      <DragHandle />
      <div
        onDoubleClick={del.confirming ? undefined : handleDoubleClick}
        title={del.confirming ? undefined : "Double-click to change block"}
        style={{
          display: "inline-flex", alignItems: "center", gap: "0.5rem",
          margin: "0.75rem 0", padding: "0.5rem 0.875rem",
          borderRadius: "0.5rem", border: `1px solid ${del.confirming ? "var(--destructive)" : "var(--border)"}`,
          backgroundColor: "var(--card)", cursor: del.confirming ? "default" : "pointer", userSelect: "none",
          maxWidth: "100%", transition: "border-color 150ms",
        }}
        onMouseEnter={del.confirming ? undefined : e => (e.currentTarget as HTMLDivElement).style.borderColor = "var(--primary)"}
        onMouseLeave={del.confirming ? undefined : e => (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)"}
      >
        <span style={{ fontSize: "1rem", lineHeight: 1 }}>🧩</span>
        <span style={{ fontSize: "0.875rem", fontWeight: 500, color: del.confirming ? "var(--muted-foreground)" : "var(--foreground)" }}>
          {label || slug}
        </span>
        {!del.confirming && (
          <span style={{ fontSize: "0.7rem", fontFamily: "monospace", color: "var(--muted-foreground)", opacity: 0.5 }}>
            [block:{slug}]
          </span>
        )}
        {del.confirming ? (
          <>
            <span style={{ fontSize: "0.75rem", color: "var(--destructive)", fontWeight: 500 }}>Remove block?</span>
            <button type="button" onMouseDown={(e) => { e.preventDefault(); del.confirm(); }} style={{ ...btnSm, background: "var(--destructive)", color: "#fff", border: "none" }}>Confirm</button>
            <button type="button" onMouseDown={(e) => { e.preventDefault(); del.cancel(); }} style={btnSm}>Cancel</button>
          </>
        ) : (
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); del.request(); }}
            style={{
              marginLeft: "0.25rem", width: "18px", height: "18px", borderRadius: "50%",
              border: "none", background: "transparent", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--muted-foreground)", fontSize: "0.9rem", lineHeight: 1,
            }}
            title="Remove block"
          >×</button>
        )}
      </div>
    </NodeViewWrapper>
  );
}

const BlockMarker = TipTapNode.create({
  name: "blockMarker",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      slug: { default: "" },
      label: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-block-marker]", getAttrs: (el) => ({
      slug: (el as Element).getAttribute("data-block-marker") ?? "",
      label: (el as Element).getAttribute("data-block-label") ?? "",
    }) }];
  },

  renderHTML({ node }) {
    return ["div", { "data-block-marker": node.attrs.slug, "data-block-label": node.attrs.label }];
  },

  addStorage() {
    return {
      // Set by RichTextEditor to allow NodeView to open the picker in replace mode
      openPicker: null as ((pos: number) => void) | null,
      markdown: {
        serialize(state: { write: (s: string) => void; closeBlock: (node: unknown) => void }, node: { attrs: Record<string, string> }) {
          state.write(`[block:${node.attrs.slug}]`);
          state.closeBlock(node);
        },
        parse: {
          updateDOM(dom: Element) {
            // Convert <p>[block:slug]</p> paragraphs to <div data-block-marker="slug">
            dom.querySelectorAll("p").forEach((p) => {
              const text = (p.textContent ?? "").trim();
              const match = text.match(/^\[block:([^\]]+)\]$/);
              if (match) {
                const div = document.createElement("div");
                div.setAttribute("data-block-marker", match[1]);
                p.parentNode?.replaceChild(div, p);
              }
            });
          },
        },
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      // Arrow down or Enter when block is selected → insert paragraph below and move cursor there
      ArrowDown: ({ editor }) => {
        const { selection, doc } = editor.state;
        const node = doc.nodeAt(selection.from);
        if (node?.type.name !== "blockMarker") return false;
        const end = selection.from + node.nodeSize;
        // If nothing follows, insert paragraph and move cursor there
        if (end >= doc.content.size) {
          editor.chain()
            .insertContentAt(end, { type: "paragraph" })
            .setTextSelection(end + 1)
            .run();
          return true;
        }
        editor.commands.setTextSelection(end + 1);
        return true;
      },
      Enter: ({ editor }) => {
        const { selection, doc } = editor.state;
        const node = doc.nodeAt(selection.from);
        if (node?.type.name !== "blockMarker") return false;
        const end = selection.from + node.nodeSize;
        editor.chain()
          .insertContentAt(end, { type: "paragraph" })
          .setTextSelection(end + 1)
          .run();
        return true;
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(BlockMarkerView);
  },
});

/* ─── Video embed node + NodeView ───────────────────────────── */
function parseVideoEmbedSrc(url: string, startAt?: number): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const start = startAt && startAt > 0 ? startAt : 0;
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (!id) return null;
      return start ? `https://www.youtube.com/embed/${id}?start=${start}` : `https://www.youtube.com/embed/${id}`;
    }
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1);
      if (!id) return null;
      return start ? `https://www.youtube.com/embed/${id}?start=${start}` : `https://www.youtube.com/embed/${id}`;
    }
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.slice(1).split("/")[0];
      if (!id) return null;
      return start ? `https://player.vimeo.com/video/${id}#t=${start}s` : `https://player.vimeo.com/video/${id}`;
    }
  } catch { /* not valid yet */ }
  return null;
}

function VideoNodeView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const { url, startAt, width, align } = node.attrs as {
    url: string; startAt: number; width: string | null; align: "left" | "center" | "right";
  };
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [nodeDragging, setNodeDragging] = useState(false);
  const [draft, setDraft] = useState(url);
  const [draftStart, setDraftStart] = useState(String(startAt || 0));
  const del = useConfirmDelete(deleteNode);
  const containerRef = useRef<HTMLDivElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const startX = useRef(0);
  const startW = useRef(0);

  // Focus URL input without triggering editor blur
  useEffect(() => {
    if (editing) {
      const t = setTimeout(() => urlInputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [editing]);

  const embedSrc = parseVideoEmbedSrc(url, startAt);
  const currentAlign = align ?? "center";
  const effectiveWidth = width ?? "100%";

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startX.current = e.clientX;
    startW.current = containerRef.current?.offsetWidth ?? 600;
    setDragging(true);
    const onMove = (ev: MouseEvent) => {
      const newW = Math.max(200, startW.current + (ev.clientX - startX.current));
      updateAttributes({ width: `${Math.round(newW)}px` });
    };
    const onUp = () => {
      setDragging(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const confirm = () => {
    updateAttributes({ url: draft, startAt: parseInt(draftStart) || 0 });
    setEditing(false);
  };

  const wrapperStyle: React.CSSProperties = currentAlign === "left"
    ? { float: "left", width: effectiveWidth, margin: "0.75rem 1.5rem 0.75rem 0" }
    : currentAlign === "right"
    ? { float: "right", width: effectiveWidth, margin: "0.75rem 0 0.75rem 1.5rem" }
    : { display: "flex", justifyContent: "center", margin: "1rem 0", clear: "both" };

  const btnBase: React.CSSProperties = { fontSize: "0.7rem", padding: "0.15rem 0.375rem", borderRadius: "3px", border: "1px solid var(--border)", cursor: "pointer", background: "transparent" };
  const btnSm: React.CSSProperties = { fontSize: "0.7rem", padding: "0.15rem 0.4rem", borderRadius: "3px", border: "1px solid var(--border)", cursor: "pointer", background: "transparent", color: "var(--foreground)", lineHeight: 1 };

  return (
    <NodeViewWrapper
      draggable
      style={{ ...wrapperStyle, position: "relative" }}
      contentEditable={false}
      onDragStart={() => setNodeDragging(true)}
      onDragEnd={() => setNodeDragging(false)}
    >
      <DragHandle />
      {/* Container: no overflow:hidden so resize handle isn't clipped */}
      <div ref={containerRef} style={{ position: "relative", width: (currentAlign === "left" || currentAlign === "right") ? "100%" : effectiveWidth, maxWidth: "100%", borderRadius: "8px", border: del.confirming ? "2px solid var(--destructive)" : selected ? "2px solid var(--primary)" : "1px solid var(--border)", backgroundColor: "var(--card)", transition: "border-color 150ms" }}>
        {/* Iframe wrapper: own overflow:hidden for rounded top corners */}
        <div style={{ borderRadius: "6px 6px 0 0", overflow: "hidden" }}>
          {embedSrc ? (
            <div style={{ position: "relative", paddingBottom: "56.25%", height: 0 }}>
              <iframe
                src={embedSrc}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title="Video embed"
              />
              {/* Overlay during resize OR node-drag — prevents iframe from stealing events */}
              {(dragging || nodeDragging) && <div style={{ position: "absolute", inset: 0, zIndex: 10, cursor: dragging ? "ew-resize" : "grabbing" }} />}
            </div>
          ) : (
            <div style={{ padding: "2rem", textAlign: "center", color: "var(--muted-foreground)", fontSize: "0.875rem" }}>
              🎬 No valid video URL
            </div>
          )}
        </div>

        {/* Confirm-remove overlay — same pattern as block marker */}
        {del.confirming && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 30, borderRadius: "6px",
            backgroundColor: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
          }}>
            <span style={{ fontSize: "0.8rem", color: "var(--destructive)", fontWeight: 600 }}>Remove video?</span>
            <button type="button" onMouseDown={(e) => { e.preventDefault(); del.confirm(); }} style={{ ...btnSm, background: "var(--destructive)", color: "#fff", border: "none" }}>Confirm</button>
            <button type="button" onMouseDown={(e) => { e.preventDefault(); del.cancel(); }} style={btnSm}>Cancel</button>
          </div>
        )}

        {/* Resize handle — absolute inside container (no overflow:hidden here), above footer */}
        {selected && !editing && !del.confirming && (
          <div
            title="Træk for at ændre størrelse"
            onMouseDown={handleResizeMouseDown}
            style={{
              position: "absolute", bottom: "36px", right: "4px",
              width: "18px", height: "18px", cursor: "se-resize", zIndex: 20,
              borderRadius: "3px", display: "flex", alignItems: "center", justifyContent: "center",
              backgroundColor: "var(--background)", border: "1px solid var(--border)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
            }}
          >
            <svg width="8" height="8" viewBox="0 0 8 8">
              <circle cx="6" cy="2" r="1" fill="currentColor" opacity="0.5" />
              <circle cx="2" cy="6" r="1" fill="currentColor" opacity="0.5" />
              <circle cx="6" cy="6" r="1" fill="currentColor" opacity="0.5" />
            </svg>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", gap: "2px", padding: "0.2rem 0.375rem", borderTop: "1px solid var(--border)", backgroundColor: "var(--muted)", borderRadius: "0 0 6px 6px" }}>
          {editing ? (
            <>
              <input ref={urlInputRef} type="url" value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirm(); } if (e.key === "Escape") { e.preventDefault(); setEditing(false); } }}
                placeholder="YouTube or Vimeo URL"
                style={{ flex: 1, minWidth: 0, fontSize: "0.75rem", padding: "0.2rem 0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontFamily: "monospace" }}
              />
              <span style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", whiteSpace: "nowrap", padding: "0 4px" }}>Start:</span>
              <input type="number" value={draftStart} onChange={(e) => setDraftStart(e.target.value)}
                min={0} placeholder="0"
                style={{ width: "52px", fontSize: "0.75rem", padding: "0.2rem 0.35rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)" }}
              />
              <span style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", padding: "0 2px" }}>s</span>
              <CtxSep />
              <CtxBtn title="OK" active onClick={confirm}>✓</CtxBtn>
              <CtxBtn title="Cancel" onClick={() => setEditing(false)}>✕</CtxBtn>
            </>
          ) : (
            <>
              <span style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", padding: "0 4px", opacity: 0.6, flexShrink: 0 }}>
                {url.includes("youtu") ? "YouTube" : url.includes("vimeo") ? "Vimeo" : "Video"}
              </span>
              {startAt > 0 && (
                <span style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", fontFamily: "monospace", background: "var(--accent)", borderRadius: "3px", padding: "0.1rem 0.3rem", flexShrink: 0 }}>⏱ {startAt}s</span>
              )}
              <span style={{ flex: 1 }} />
              <button type="button" onMouseDown={(e) => { e.preventDefault(); setDraft(url); setDraftStart(String(startAt || 0)); setEditing(true); }}
                style={{ fontSize: "0.7rem", padding: "0.15rem 0.375rem", borderRadius: "3px", border: "1px solid var(--border)", cursor: "pointer", background: "transparent", color: "var(--foreground)" }}>Edit</button>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); del.request(); }}
                style={{ width: "18px", height: "18px", borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)", fontSize: "0.9rem", lineHeight: 1, flexShrink: 0 }}
                title="Remove video">×</button>
            </>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

const VideoEmbed = TipTapNode.create({
  name: "videoEmbed",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      url:     { default: "" },
      startAt: { default: 0,        parseHTML: el => parseInt(el.getAttribute("data-video-start") ?? "0") || 0 },
      width:   { default: null,     parseHTML: el => el.getAttribute("data-video-width") || null },
      align:   { default: "center", parseHTML: el => el.getAttribute("data-video-align") || "center" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-video-embed]", getAttrs: (el) => ({
      url:     (el as Element).getAttribute("data-video-embed") ?? "",
      startAt: parseInt((el as Element).getAttribute("data-video-start") ?? "0") || 0,
      width:   (el as Element).getAttribute("data-video-width") || null,
      align:   (el as Element).getAttribute("data-video-align") || "center",
    }) }];
  },

  renderHTML({ node }) {
    const attrs: Record<string, string> = { "data-video-embed": node.attrs.url };
    if (node.attrs.startAt > 0) attrs["data-video-start"] = String(node.attrs.startAt);
    if (node.attrs.width)       attrs["data-video-width"] = node.attrs.width;
    if (node.attrs.align && node.attrs.align !== "center") attrs["data-video-align"] = node.attrs.align;
    return ["div", attrs];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: { write: (s: string) => void; closeBlock: (node: unknown) => void }, node: { attrs: Record<string, unknown> }) {
          const { url, startAt, width, align } = node.attrs as { url: string; startAt: number; width: string | null; align: string };
          let marker = `[video:${url}`;
          if (startAt > 0)                      marker += `|start:${startAt}`;
          if (width)                             marker += `|width:${width}`;
          if (align && align !== "center")       marker += `|align:${align}`;
          marker += "]";
          state.write(marker);
          state.closeBlock(node);
        },
        parse: {
          updateDOM(dom: Element) {
            dom.querySelectorAll("p").forEach((p) => {
              const text = (p.textContent ?? "").trim();
              const match = text.match(/^\[video:([^\]]+)\]$/);
              if (!match) return;
              const raw = match[1];
              const url = raw.split("|")[0];
              const startMatch = raw.match(/\|start:(\d+)/);
              const widthMatch = raw.match(/\|width:([^|]+)/);
              const alignMatch = raw.match(/\|align:(left|center|right)/);
              const div = document.createElement("div");
              div.setAttribute("data-video-embed", url);
              if (startMatch) div.setAttribute("data-video-start", startMatch[1]);
              if (widthMatch) div.setAttribute("data-video-width", widthMatch[1].trim());
              if (alignMatch) div.setAttribute("data-video-align", alignMatch[1]);
              p.parentNode?.replaceChild(div, p);
            });
          },
        },
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      ArrowDown: ({ editor }) => {
        const { selection, doc } = editor.state;
        const node = doc.nodeAt(selection.from);
        if (node?.type.name !== "videoEmbed") return false;
        const end = selection.from + node.nodeSize;
        if (end >= doc.content.size) {
          editor.chain().insertContentAt(end, { type: "paragraph" }).setTextSelection(end + 1).run();
          return true;
        }
        editor.commands.setTextSelection(end + 1);
        return true;
      },
      Enter: ({ editor }) => {
        const { selection, doc } = editor.state;
        const node = doc.nodeAt(selection.from);
        if (node?.type.name !== "videoEmbed") return false;
        const end = selection.from + node.nodeSize;
        editor.chain().insertContentAt(end, { type: "paragraph" }).setTextSelection(end + 1).run();
        return true;
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoNodeView);
  },
});

/* ─── Toolbar button ─────────────────────────────────────────── */
function Btn({
  tooltip, active, disabled, onClick, children,
}: {
  tooltip: string; active?: boolean; disabled?: boolean;
  onClick: () => void; children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onClick(); }}
            disabled={disabled}
            aria-label={tooltip}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-md transition-colors",
              active
                ? "bg-white/12 text-foreground"
                : "text-muted-foreground hover:bg-white/8 hover:text-foreground",
              disabled && "opacity-20 pointer-events-none",
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function Sep() {
  return <div style={{ width: "1px", height: "1.25rem", backgroundColor: "var(--border)", margin: "0 0.5rem", flexShrink: 0 }} />;
}

function CtxSep() {
  return <div style={{ width: "1px", height: "1rem", backgroundColor: "var(--border)", margin: "0 0.25rem", flexShrink: 0 }} />;
}

/* ─── Link dialog with internal-page autocomplete ───────────── */
type InternalLink = { title: string; url: string; collectionLabel: string; status: string };

function LinkPopup({ onConfirm, onRemove, onClose, initial }: {
  onConfirm: (url: string) => void;
  onRemove: () => void;
  onClose: () => void;
  initial: string;
}) {
  const [url, setUrl] = useState(initial);
  const [suggestions, setSuggestions] = useState<InternalLink[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  // Fetch suggestions whenever url changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Don't suggest for pure external URLs (already has a full https:// scheme)
    const isExternal = /^https?:\/\/\S{8,}/.test(url);
    if (!url.trim() || isExternal) { setSuggestions([]); setShowSuggestions(false); return; }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/internal-links?q=${encodeURIComponent(url)}`);
        const data: InternalLink[] = await res.json();
        setSuggestions(Array.isArray(data) ? data : []);
        setSelectedIdx(0);
        setShowSuggestions(true);
      } catch { setSuggestions([]); }
    }, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [url]);

  function confirm(href: string) {
    setShowSuggestions(false);
    onConfirm(href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, suggestions.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter") { e.preventDefault(); confirm(suggestions[selectedIdx].url); return; }
      if (e.key === "Escape") { setShowSuggestions(false); return; }
    }
    if (e.key === "Enter") { e.preventDefault(); confirm(url); }
    if (e.key === "Escape") onClose();
  }

  return (
    <div
      style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50, backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "0.75rem", minWidth: "320px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginBottom: "0.5rem", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Link — URL or search pages
      </p>

      {/* Input */}
      <div style={{ position: "relative" }}>
        <input
          ref={inputRef}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => url && !(/^https?:\/\/\S{8,}/.test(url)) && setShowSuggestions(suggestions.length > 0)}
          placeholder="https:// or search pages…"
          style={{ width: "100%", padding: "0.4rem 0.625rem", borderRadius: "0.5rem", border: "1px solid var(--input)", backgroundColor: "transparent", color: "var(--foreground)", fontSize: "0.875rem", outline: "none", marginBottom: showSuggestions && suggestions.length > 0 ? "0" : "0.5rem", boxSizing: "border-box" }}
        />

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div style={{ position: "relative", marginBottom: "0.5rem", border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 0.5rem 0.5rem", overflow: "hidden", maxHeight: "200px", overflowY: "auto" }}>
            {suggestions.map((s, i) => (
              <button
                key={s.url}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); confirm(s.url); }}
                onMouseEnter={() => setSelectedIdx(i)}
                style={{
                  width: "100%", textAlign: "left", padding: "0.5rem 0.75rem",
                  background: i === selectedIdx ? "var(--accent)" : "var(--card)",
                  border: "none", cursor: "pointer",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  display: "flex", flexDirection: "column", gap: "0.1rem",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--foreground)", fontWeight: i === selectedIdx ? 500 : 400 }}>
                    {s.title}
                  </span>
                  {s.status === "draft" && (
                    <span style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", background: "var(--muted)", color: "var(--muted-foreground)", fontFamily: "monospace" }}>draft</span>
                  )}
                </span>
                <span style={{ fontSize: "0.7rem", fontFamily: "monospace", color: "var(--muted-foreground)" }}>
                  {s.url} · {s.collectionLabel}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          onClick={() => confirm(url)}
          style={{ flex: 1, padding: "0.375rem 0.75rem", borderRadius: "0.5rem", backgroundColor: "var(--primary)", color: "var(--primary-foreground)", fontSize: "0.8rem", fontWeight: 600, border: "none", cursor: "pointer" }}
        >
          Apply
        </button>
        {initial && (
          <button
            type="button"
            onClick={onRemove}
            style={{ padding: "0.375rem 0.75rem", borderRadius: "0.5rem", backgroundColor: "transparent", color: "var(--destructive)", fontSize: "0.8rem", border: "1px solid var(--destructive)", cursor: "pointer" }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Main editor ─────────────────────────────────────────────── */
export function RichTextEditor({ value, onChange, disabled }: Props) {
  const [headingOpen, setHeadingOpen] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [blockPickerOpen, setBlockPickerOpen] = useState(false);
  const [blockSearch, setBlockSearch] = useState("");
  const [replacePos, setReplacePos] = useState<number | null>(null);
  const [availableBlocks, setAvailableBlocks] = useState<{ slug: string; label: string; blockType: string }[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const headingRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [imgDelConfirming, setImgDelConfirming] = useState(false);
  const imgDelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Start writing…" }),
      TipTapLink.configure({ openOnClick: false }),
      ResizableImage.configure({ inline: false }),
      BlockMarker,
      VideoEmbed,
      TextDragDrop,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Markdown.configure({ html: false, transformPastedText: true }),
    ],
    content: value || "",
    editable: !disabled,
    onUpdate: ({ editor }) => onChange(editor.storage.markdown.getMarkdown()),
    editorProps: {
      attributes: { class: "rte outline-none min-h-[300px]" },
    },
  });

  // Reactive toolbar state — updates on cursor move and selection change
  const toolbarState = useEditorState({
    editor,
    selector: (ctx) => ({
      isImage: ctx.editor?.isActive("image") ?? false,
      imageAlign: (ctx.editor?.isActive("image")
        ? (ctx.editor?.getAttributes("image").align as string | undefined) ?? "center"
        : null) as string | null,
      isVideo: ctx.editor?.isActive("videoEmbed") ?? false,
      videoAlign: (ctx.editor?.isActive("videoEmbed")
        ? (ctx.editor?.getAttributes("videoEmbed").align as string | undefined) ?? "center"
        : null) as string | null,
    }),
  });

  useEffect(() => {
    if (editor && !editor.isFocused) {
      const current = editor.storage.markdown.getMarkdown();
      if (value !== current) editor.commands.setContent(value || "", false);
    }
  }, [value, editor]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (headingRef.current && !headingRef.current.contains(e.target as Node)) setHeadingOpen(false);
      if (linkRef.current && !linkRef.current.contains(e.target as Node)) setLinkOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function activeKey(): HeadingKey {
    if (!editor) return "paragraph";
    if (editor.isActive("heading", { level: 1 })) return "h1";
    if (editor.isActive("heading", { level: 2 })) return "h2";
    if (editor.isActive("heading", { level: 3 })) return "h3";
    return "paragraph";
  }

  function applyHeading(key: HeadingKey) {
    if (!editor) return;
    if (key === "paragraph") editor.chain().focus().setParagraph().run();
    else editor.chain().focus().setHeading({ level: parseInt(key[1]) as 1 | 2 | 3 }).run();
    setHeadingOpen(false);
  }

  function applyLink(url: string) {
    if (!editor) return;
    const trimmed = url.trim();
    if (!trimmed) { editor.chain().focus().unsetLink().run(); }
    else { editor.chain().focus().setLink({ href: trimmed }).run(); }
    setLinkOpen(false);
  }

  function insertTable() {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }

  const uploadImage = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const { url } = await res.json();
      editor?.chain().focus().setImage({ src: url, alt: file.name }).run();
    } finally {
      setUploading(false);
    }
  }, [editor]);

  const openBlockPicker = useCallback(() => {
    setReplacePos(null);
    setBlockSearch("");
    setBlockPickerOpen(true);
  }, []);

  const closeBlockPicker = useCallback(() => {
    setBlockPickerOpen(false);
    setReplacePos(null);
    setBlockSearch("");
  }, []);

  const insertBlock = useCallback((slug: string, label: string) => {
    if (!editor) return;
    if (replacePos !== null) {
      // Replace existing BlockMarker node at replacePos
      editor.chain().command(({ tr, state }) => {
        const node = state.doc.nodeAt(replacePos);
        if (node?.type.name === "blockMarker") {
          tr.replaceWith(replacePos, replacePos + node.nodeSize,
            state.schema.nodes.blockMarker.create({ slug, label })
          );
        }
        return true;
      }).run();
    } else {
      // Insert block + ensure a paragraph follows so the cursor can land there
      editor.chain().focus()
        .insertContent({ type: "blockMarker", attrs: { slug, label } })
        .command(({ tr, state }) => {
          const pos = state.selection.from;
          if (pos >= state.doc.content.size) {
            tr.insert(state.doc.content.size, state.schema.nodes.paragraph.create());
          }
          return true;
        })
        .run();
    }
    closeBlockPicker();
  }, [editor, replacePos, closeBlockPicker]);

  // On mount: fetch block labels and update any BlockMarker nodes that only have slug
  useEffect(() => {
    if (!editor) return;
    fetch("/api/cms/blocks")
      .then(r => r.ok ? r.json() : [])
      .then((docs: { slug: string; data: { label?: string; blockType?: string } }[]) => {
        const labelMap: Record<string, string> = Object.fromEntries(
          docs.map(d => [d.slug, d.data?.label ?? d.slug])
        );
        setAvailableBlocks(docs.map(d => ({
          slug: d.slug,
          label: d.data?.label ?? d.slug,
          blockType: d.data?.blockType ?? "unknown",
        })));
        // Update any BlockMarker nodes missing their label
        const { state } = editor;
        const tr = state.tr;
        let changed = false;
        state.doc.descendants((node, pos) => {
          if (node.type.name === "blockMarker" && node.attrs.slug) {
            const newLabel = labelMap[node.attrs.slug as string];
            if (newLabel && newLabel !== node.attrs.label) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, label: newLabel });
              changed = true;
            }
          }
        });
        if (changed) editor.view.dispatch(tr);
      })
      .catch(() => {});

    // Let BlockMarkerView trigger the picker in replace mode via storage callback
    editor.storage.blockMarker.openPicker = (pos: number) => {
      setReplacePos(pos);
      setBlockPickerOpen(true);
      setBlockSearch("");
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const curKey = activeKey();
  const curLabel = HEADING_OPTIONS.find(h => h.key === curKey)?.label ?? "Normal text";
  const currentLink = editor?.getAttributes("link").href ?? "";

  return (
    <TooltipProvider delay={700}>
      <div className={cn(
        "rounded-lg border border-border overflow-visible",
        "focus-within:ring-1 focus-within:ring-ring focus-within:border-ring transition-shadow",
        disabled && "opacity-50 pointer-events-none",
      )}>

        {/* ── Main Toolbar ── */}
        {!disabled && editor && (
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "2px", padding: "0.375rem 0.75rem", borderBottom: "1px solid var(--border)", position: "sticky", top: "132px", zIndex: 20, backgroundColor: "var(--background)", borderRadius: "0.5rem 0.5rem 0 0" }}>

            <Btn tooltip="Undo (⌘Z)" disabled={!editor.can().undo()}
              onClick={() => editor.chain().focus().undo().run()}>
              <IconUndo />
            </Btn>
            <Btn tooltip="Redo (⌘⇧Z)" disabled={!editor.can().redo()}
              onClick={() => editor.chain().focus().redo().run()}>
              <IconRedo />
            </Btn>

            <Sep />

            {/* Heading picker */}
            <div style={{ position: "relative" }} ref={headingRef}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); setHeadingOpen(o => !o); }}
                      style={{
                        display: "flex", height: "2.25rem", alignItems: "center", gap: "0.25rem",
                        borderRadius: "0.375rem", padding: "0 0.75rem",
                        fontSize: "0.875rem", fontWeight: 500, cursor: "pointer", userSelect: "none",
                        color: headingOpen ? "var(--foreground)" : "var(--muted-foreground)",
                        backgroundColor: headingOpen ? "rgba(255,255,255,0.10)" : "transparent",
                        border: "none", transition: "background 150ms",
                      }}
                    />
                  }
                >
                  <span style={{ minWidth: "96px", textAlign: "left", fontSize: "0.875rem" }}>{curLabel}</span>
                  <IconChevronDown />
                </TooltipTrigger>
                <TooltipContent side="bottom">Text style</TooltipContent>
              </Tooltip>

              {headingOpen && (
                <div style={{ position: "absolute", left: 0, top: "calc(100% + 6px)", zIndex: 50, borderRadius: "0.75rem", border: "1px solid var(--border)", boxShadow: "0 8px 24px rgba(0,0,0,0.4)", padding: "0.25rem 0", overflow: "hidden", minWidth: "220px", backgroundColor: "var(--card)" }}>
                  {HEADING_OPTIONS.map((h) => {
                    const isActive = curKey === h.key;
                    const isHovered = hoveredKey === h.key;
                    return (
                      <button
                        key={h.key}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); applyHeading(h.key); }}
                        onMouseEnter={() => setHoveredKey(h.key)}
                        onMouseLeave={() => setHoveredKey(null)}
                        style={{
                          fontSize: h.fontSize, fontWeight: h.fontWeight, lineHeight: 1.3,
                          backgroundColor: isActive ? "rgba(255,255,255,0.10)" : isHovered ? "rgba(255,255,255,0.07)" : "transparent",
                          color: "var(--foreground)", width: "100%", display: "flex",
                          alignItems: "center", justifyContent: "space-between",
                          padding: "0.625rem 1rem", textAlign: "left", border: "none", cursor: "pointer",
                        }}
                      >
                        <span>{h.label}</span>
                        {isActive && <IconCheck />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <Sep />

            <Btn tooltip="Bold (⌘B)" active={editor.isActive("bold")}
              onClick={() => editor.chain().focus().toggleBold().run()}>
              <IconBold />
            </Btn>
            <Btn tooltip="Italic (⌘I)" active={editor.isActive("italic")}
              onClick={() => editor.chain().focus().toggleItalic().run()}>
              <IconItalic />
            </Btn>
            <Btn tooltip="Strikethrough" active={editor.isActive("strike")}
              onClick={() => editor.chain().focus().toggleStrike().run()}>
              <IconStrikethrough />
            </Btn>
            <Btn tooltip="Inline code" active={editor.isActive("code")}
              onClick={() => editor.chain().focus().toggleCode().run()}>
              <IconCode />
            </Btn>

            <Sep />

            <Btn tooltip="Bullet list" active={editor.isActive("bulletList")}
              onClick={() => editor.chain().focus().toggleBulletList().run()}>
              <IconBulletList />
            </Btn>
            <Btn tooltip="Numbered list" active={editor.isActive("orderedList")}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}>
              <IconNumberedList />
            </Btn>
            <Btn tooltip="Blockquote" active={editor.isActive("blockquote")}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}>
              <IconBlockquote />
            </Btn>
            <Btn tooltip="Horizontal rule"
              onClick={() => editor.chain().focus().setHorizontalRule().run()}>
              <IconHorizontalRule />
            </Btn>

            <Sep />

            {/* Link */}
            <div style={{ position: "relative" }} ref={linkRef}>
              <Btn tooltip="Link (⌘K)" active={editor.isActive("link")}
                onClick={() => setLinkOpen(o => !o)}>
                <IconLink />
              </Btn>
              {linkOpen && (
                <LinkPopup
                  initial={currentLink}
                  onConfirm={applyLink}
                  onRemove={() => { editor.chain().focus().unsetLink().run(); setLinkOpen(false); }}
                  onClose={() => setLinkOpen(false)}
                />
              )}
            </div>

            {/* Table */}
            <Btn tooltip="Insert table" active={editor.isActive("table")}
              onClick={insertTable}>
              <IconTable />
            </Btn>

            {/* Image */}
            <Btn tooltip={uploading ? "Uploading…" : "Insert image"} disabled={uploading}
              onClick={() => imageInputRef.current?.click()}>
              <IconImage />
            </Btn>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = ""; }}
            />

            {/* Insert Block */}
            <Btn tooltip="Insert content block" onClick={openBlockPicker}>
              <IconBlocks />
            </Btn>

            {/* Insert Video */}
            <Btn tooltip="Insert video embed" onClick={() => {
              const url = window.prompt("YouTube or Vimeo URL");
              if (!url) return;
              editor.chain().focus().insertContent({ type: "videoEmbed", attrs: { url } }).run();
            }}>
              <IconVideo />
            </Btn>

          </div>
        )}

        {/* ── Context toolbar — image controls ── */}
        {!disabled && editor && toolbarState?.isImage && (
          <div style={{
            display: "flex", alignItems: "center", gap: "2px",
            padding: "0.25rem 0.75rem",
            borderBottom: "1px solid var(--border)",
            backgroundColor: "var(--background)",
            position: "sticky", top: "calc(132px + 49px)", zIndex: 19,
          }}>
            <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginRight: "0.25rem", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>Image</span>
            <CtxSep />
            <CtxBtn title="Float left" active={toolbarState.imageAlign === "left"}
              onClick={() => editor.chain().focus().updateAttributes("image", { align: "left" }).run()}>
              <IconAlignLeft />
            </CtxBtn>
            <CtxBtn title="Center (full width)" active={toolbarState.imageAlign === "center"}
              onClick={() => editor.chain().focus().updateAttributes("image", { align: "center" }).run()}>
              <IconAlignCenter />
            </CtxBtn>
            <CtxBtn title="Float right" active={toolbarState.imageAlign === "right"}
              onClick={() => editor.chain().focus().updateAttributes("image", { align: "right" }).run()}>
              <IconAlignRight />
            </CtxBtn>
            <CtxSep />
            <CtxBtn title="Reset width to full" active={false}
              onClick={() => editor.chain().focus().updateAttributes("image", { width: null }).run()}>
              <IconMaximize />
            </CtxBtn>
            <CtxSep />
            {imgDelConfirming ? (
              <>
                <span style={{ fontSize: "0.7rem", color: "var(--destructive)", fontWeight: 500, padding: "0 4px" }}>Remove?</span>
                <CtxBtn title="Confirm delete" danger onClick={() => {
                  if (imgDelTimer.current) clearTimeout(imgDelTimer.current);
                  setImgDelConfirming(false);
                  editor.chain().focus().deleteSelection().run();
                }}><IconTrash /></CtxBtn>
                <CtxBtn title="Cancel" active={false} onClick={() => {
                  if (imgDelTimer.current) clearTimeout(imgDelTimer.current);
                  setImgDelConfirming(false);
                }}>✕</CtxBtn>
              </>
            ) : (
              <CtxBtn title="Delete image" danger onClick={() => {
                setImgDelConfirming(true);
                imgDelTimer.current = setTimeout(() => setImgDelConfirming(false), 3500);
              }}><IconTrash /></CtxBtn>
            )}
          </div>
        )}

        {/* ── Context toolbar — video controls ── */}
        {!disabled && editor && toolbarState?.isVideo && (
          <div style={{
            display: "flex", alignItems: "center", gap: "2px",
            padding: "0.25rem 0.75rem",
            borderBottom: "1px solid var(--border)",
            backgroundColor: "var(--background)",
            position: "sticky", top: "calc(132px + 49px)", zIndex: 19,
          }}>
            <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginRight: "0.25rem", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>Video</span>
            <CtxSep />
            <CtxBtn title="Float left"   active={toolbarState.videoAlign === "left"}
              onClick={() => editor.chain().focus().updateAttributes("videoEmbed", { align: "left" }).run()}>
              <IconAlignLeft />
            </CtxBtn>
            <CtxBtn title="Center (full width)" active={toolbarState.videoAlign === "center"}
              onClick={() => editor.chain().focus().updateAttributes("videoEmbed", { align: "center" }).run()}>
              <IconAlignCenter />
            </CtxBtn>
            <CtxBtn title="Float right"  active={toolbarState.videoAlign === "right"}
              onClick={() => editor.chain().focus().updateAttributes("videoEmbed", { align: "right" }).run()}>
              <IconAlignRight />
            </CtxBtn>
          </div>
        )}

        {/* ── Body ── */}
        <div className="rte-body">
          <EditorContent editor={editor} />
          {editor && !disabled && <AIBubbleMenu editor={editor} />}
        </div>
      </div>

      {/* ── Block Picker dialog ── */}
      {blockPickerOpen && (() => {
        const filtered = blockSearch.trim()
          ? availableBlocks.filter(b =>
              b.label.toLowerCase().includes(blockSearch.toLowerCase()) ||
              b.slug.toLowerCase().includes(blockSearch.toLowerCase()) ||
              b.blockType.toLowerCase().includes(blockSearch.toLowerCase())
            )
          : availableBlocks;
        return (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)" }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) closeBlockPicker(); }}
          >
            <div style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "1rem", padding: "1.5rem", width: "460px", maxHeight: "70vh", display: "flex", flexDirection: "column", gap: "0.875rem", boxShadow: "0 24px 48px rgba(0,0,0,0.5)" }}>

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <p style={{ fontSize: "0.75rem", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)" }}>
                  {replacePos !== null ? "Replace Content Block" : "Insert Content Block"}
                </p>
                <button type="button" onClick={closeBlockPicker} style={{ background: "none", border: "none", color: "var(--muted-foreground)", cursor: "pointer", fontSize: "1.2rem", lineHeight: 1 }}>×</button>
              </div>

              {/* Search */}
              <input
                autoFocus
                type="text"
                placeholder="Search blocks…"
                value={blockSearch}
                onChange={e => setBlockSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Escape") closeBlockPicker();
                  if (e.key === "Enter" && filtered.length === 1) insertBlock(filtered[0].slug, filtered[0].label);
                }}
                style={{
                  width: "100%", padding: "0.5rem 0.75rem", borderRadius: "0.5rem",
                  border: "1px solid var(--input)", backgroundColor: "var(--background)",
                  color: "var(--foreground)", fontSize: "0.875rem", outline: "none",
                  boxSizing: "border-box",
                }}
              />

              {/* List */}
              <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.375rem", flex: 1 }}>
                {blocksLoading && (
                  <p style={{ fontSize: "0.875rem", color: "var(--muted-foreground)", padding: "1rem 0" }}>Loading blocks…</p>
                )}
                {!blocksLoading && filtered.length === 0 && (
                  <p style={{ fontSize: "0.875rem", color: "var(--muted-foreground)", padding: "1rem 0" }}>
                    {availableBlocks.length === 0
                      ? <>No blocks found. Create one in <strong>Content Blocks</strong> first.</>
                      : "No blocks match your search."}
                  </p>
                )}
                {filtered.map(block => (
                  <button
                    key={block.slug}
                    type="button"
                    onClick={() => insertBlock(block.slug, block.label)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", borderRadius: "0.625rem", border: "1px solid var(--border)", backgroundColor: "transparent", cursor: "pointer", textAlign: "left", transition: "border-color 120ms, background 120ms" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.05)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--primary)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
                  >
                    <div>
                      <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--foreground)", marginBottom: "2px" }}>{block.label}</p>
                      <p style={{ fontSize: "0.7rem", fontFamily: "monospace", color: "var(--muted-foreground)" }}>{block.slug} · {block.blockType}</p>
                    </div>
                    <span style={{ fontSize: "0.7rem", fontFamily: "monospace", color: "var(--muted-foreground)", opacity: 0.5, flexShrink: 0, marginLeft: "0.5rem" }}>[block:{block.slug}]</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </TooltipProvider>
  );
}
