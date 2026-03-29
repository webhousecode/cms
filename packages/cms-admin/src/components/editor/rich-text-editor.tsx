"use client";

import { memo } from "react";
import { useEditor, EditorContent, useEditorState, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { AIBubbleMenu } from "./ai-bubble-menu";
import type { NodeViewProps } from "@tiptap/react";
import { Node as TipTapNode, Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "prosemirror-state";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import TipTapLink from "@tiptap/extension-link";
import TipTapImage from "@tiptap/extension-image";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
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
  IconHorizontalRule, IconVideo, IconAudio, IconAttachment, IconCallout,
  IconInteractive, IconFile, IconDownload,
  IconUnderline, IconSuperscript, IconSubscript, IconHighlight,
  IconZoomIn, IconZoomOut, IconProofread,
} from "./editor-icons";
import { Image as LucideImage, Zap, MessageSquareWarning } from "lucide-react";
import { toast } from "sonner";
import { AIMetadataPopover } from "@/components/media/ai-metadata-popover";

interface Props {
  value: string;
  onChange: (val: unknown) => void;
  disabled?: boolean;
  /** Sticky toolbar offset from top in px (default 0). Top-level editors pass header height. */
  stickyOffset?: number;
  /** Whitelist of toolbar features. If omitted, all features available. */
  features?: string[];
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
function ImageNodeView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const { src, alt, width, align } = node.attrs as {
    src: string; alt: string | null; width: string | null; align: "left" | "center" | "right" | null;
  };
  const imgRef = useRef<HTMLImageElement>(null);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const del = useConfirmDelete(deleteNode);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startX.current = e.clientX;
    const origWidth = imgRef.current?.offsetWidth ?? 300;
    startWidth.current = origWidth;
    const onMouseMove = (ev: MouseEvent) => {
      const newWidth = Math.max(80, startWidth.current + (ev.clientX - startX.current));
      updateAttributes({ width: `${Math.round(newWidth)}px` });
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keydown", onEsc);
    };
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        updateAttributes({ width: origWidth ? `${origWidth}px` : null });
        onMouseUp();
      }
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onEsc);
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
      <div style={{ position: "relative", display: "inline-block", maxWidth: "100%", borderRadius: "8px", overflow: "hidden", border: selected ? "2px solid var(--primary)" : "1px solid transparent" }}>
        <img
          ref={imgRef}
          src={src}
          alt={alt ?? ""}
          draggable={false}
          style={{
            width: effectiveWidth,
            maxWidth: "100%",
            display: "block",
          }}
        />
        {/* Footer bar — delete (matches Video/Interactive pattern) */}
        {selected && (
          <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "0.15rem 0.375rem", backgroundColor: "var(--muted)", borderTop: "1px solid var(--border)" }}>
            <span style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", padding: "0 4px", opacity: 0.6, flex: 1 }}>Image</span>
            {del.confirming ? (
              <>
                <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Remove?</span>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); del.confirm(); }}
                  style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "none", background: "var(--destructive)", color: "#fff", cursor: "pointer", lineHeight: 1 }}>Yes</button>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); del.cancel(); }}
                  style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}>No</button>
              </>
            ) : (
              <button type="button" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); del.request(); }}
                style={{ width: "18px", height: "18px", borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)", fontSize: "0.9rem", lineHeight: 1, flexShrink: 0 }}
                title="Remove image">×</button>
            )}
          </div>
        )}
        {selected && (
          <div
            title="Drag to resize"
            onMouseDown={handleResizeMouseDown}
            style={{
              position: "absolute", bottom: selected ? "28px" : "4px", right: "4px",
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
      (editor.storage as any).blockMarker?.openPicker?.(pos);
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
    const origW = containerRef.current?.offsetWidth ?? 600;
    startW.current = origW;
    setDragging(true);
    const cleanup = () => {
      setDragging(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("keydown", onEsc);
    };
    const onMove = (ev: MouseEvent) => {
      const newW = Math.max(200, startW.current + (ev.clientX - startX.current));
      updateAttributes({ width: `${Math.round(newW)}px` });
    };
    const onUp = () => cleanup();
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        updateAttributes({ width: origW ? `${origW}px` : null });
        cleanup();
      }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("keydown", onEsc);
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
      <div ref={containerRef} style={{ position: "relative", width: (currentAlign === "left" || currentAlign === "right") ? "100%" : effectiveWidth, maxWidth: "100%", borderRadius: "8px", border: selected ? "2px solid var(--primary)" : "1px solid var(--border)", backgroundColor: "var(--card)", transition: "border-color 150ms" }}>
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

        {/* Resize handle — absolute inside container (no overflow:hidden here), above footer */}
        {selected && !editing && (
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
              {del.confirming ? (
                <>
                  <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Remove?</span>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); del.confirm(); }}
                    style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "none", background: "var(--destructive)", color: "#fff", cursor: "pointer", lineHeight: 1 }}>Yes</button>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); del.cancel(); }}
                    style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}>No</button>
                </>
              ) : (
                <button type="button" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); del.request(); }}
                  style={{ width: "18px", height: "18px", borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)", fontSize: "0.9rem", lineHeight: 1, flexShrink: 0 }}
                  title="Remove video">×</button>
              )}
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

/* ─── Audio embed node + NodeView ───────────────────────────── */
function AudioNodeView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const { src, title, align } = node.attrs as {
    src: string; title: string; align: "left" | "center" | "right";
  };
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const del = useConfirmDelete(deleteNode);
  const currentAlign = align ?? "center";

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "audio");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const { url } = await res.json();
      updateAttributes({ src: url, title: file.name });
    } finally {
      setUploading(false);
    }
  };

  const wrapperJustify = currentAlign === "left" ? "flex-start" : currentAlign === "right" ? "flex-end" : "center";

  if (!src) {
    return (
      <NodeViewWrapper draggable contentEditable={false} style={{ display: "flex", justifyContent: wrapperJustify, margin: "0.75rem 0", position: "relative" }}>
        <DragHandle />
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleUpload(f); }}
          onClick={() => fileRef.current?.click()}
          style={{
            width: "100%", maxWidth: "500px", padding: "2rem", textAlign: "center",
            borderRadius: "8px", border: `2px dashed ${dragOver ? "var(--primary)" : "var(--border)"}`,
            backgroundColor: dragOver ? "rgba(255,255,255,0.04)" : "var(--card)",
            cursor: "pointer", color: "var(--muted-foreground)", fontSize: "0.875rem",
            transition: "border-color 150ms, background 150ms",
          }}
        >
          {uploading ? "Uploading…" : "Drop or click to upload audio"}
          <input ref={fileRef} type="file" accept="audio/*" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />
        </div>
      </NodeViewWrapper>
    );
  }

  const btnSm: React.CSSProperties = { fontSize: "0.7rem", padding: "0.15rem 0.4rem", borderRadius: "3px", border: "1px solid var(--border)", cursor: "pointer", background: "transparent", color: "var(--foreground)", lineHeight: 1 };

  return (
    <NodeViewWrapper draggable contentEditable={false} style={{ display: "flex", justifyContent: wrapperJustify, margin: "0.75rem 0", position: "relative" }}>
      <DragHandle />
      <div style={{
        width: "100%", maxWidth: "500px", borderRadius: "8px",
        border: del.confirming ? "2px solid var(--destructive)" : selected ? "2px solid var(--primary)" : "1px solid var(--border)",
        backgroundColor: "var(--card)", overflow: "hidden", position: "relative",
        transition: "border-color 150ms",
      }}>
        <div style={{ padding: "0.75rem 1rem" }}>
          <audio controls src={src} style={{ width: "100%", height: "36px" }} />
        </div>
        {del.confirming && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 30, borderRadius: "6px",
            backgroundColor: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
          }}>
            <span style={{ fontSize: "0.8rem", color: "var(--destructive)", fontWeight: 600 }}>Remove audio?</span>
            <button type="button" onMouseDown={(e) => { e.preventDefault(); del.confirm(); }} style={{ ...btnSm, background: "var(--destructive)", color: "#fff", border: "none" }}>Confirm</button>
            <button type="button" onMouseDown={(e) => { e.preventDefault(); del.cancel(); }} style={btnSm}>Cancel</button>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "0.2rem 0.375rem", borderTop: "1px solid var(--border)", backgroundColor: "var(--muted)", borderRadius: "0 0 6px 6px" }}>
          <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", padding: "0 4px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title || "Audio"}
          </span>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); del.request(); }}
            style={{ width: "18px", height: "18px", borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)", fontSize: "0.9rem", lineHeight: 1, flexShrink: 0 }}
            title="Remove audio">×</button>
        </div>
      </div>
    </NodeViewWrapper>
  );
}

const AudioEmbed = TipTapNode.create({
  name: "audioEmbed",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src:   { default: "" },
      title: { default: "" },
      align: { default: "center", parseHTML: el => el.getAttribute("data-audio-align") || "center" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-audio-embed]", getAttrs: (el) => ({
      src:   (el as Element).getAttribute("data-audio-embed") ?? "",
      title: (el as Element).getAttribute("data-audio-title") ?? "",
      align: (el as Element).getAttribute("data-audio-align") || "center",
    }) }];
  },

  renderHTML({ node }) {
    const attrs: Record<string, string> = { "data-audio-embed": node.attrs.src };
    if (node.attrs.title) attrs["data-audio-title"] = node.attrs.title;
    if (node.attrs.align && node.attrs.align !== "center") attrs["data-audio-align"] = node.attrs.align;
    return ["div", attrs];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: { write: (s: string) => void; closeBlock: (node: unknown) => void }, node: { attrs: Record<string, unknown> }) {
          const { src } = node.attrs as { src: string };
          state.write(`<audio controls src="${src}"></audio>`);
          state.closeBlock(node);
        },
        parse: {
          updateDOM(dom: Element) {
            dom.querySelectorAll("audio[src]").forEach((audio) => {
              const src = audio.getAttribute("src") ?? "";
              const div = document.createElement("div");
              div.setAttribute("data-audio-embed", src);
              audio.parentNode?.replaceChild(div, audio);
            });
            // Also handle <p><audio ...></audio></p> wrapping
            dom.querySelectorAll("p").forEach((p) => {
              const audio = p.querySelector("audio[src]");
              if (audio && p.childNodes.length === 1) {
                const src = audio.getAttribute("src") ?? "";
                const div = document.createElement("div");
                div.setAttribute("data-audio-embed", src);
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
      ArrowDown: ({ editor }) => {
        const { selection, doc } = editor.state;
        const node = doc.nodeAt(selection.from);
        if (node?.type.name !== "audioEmbed") return false;
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
        if (node?.type.name !== "audioEmbed") return false;
        const end = selection.from + node.nodeSize;
        editor.chain().insertContentAt(end, { type: "paragraph" }).setTextSelection(end + 1).run();
        return true;
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(AudioNodeView);
  },
});

/* ─── Interactive embed node + NodeView ─────────────────────── */
function InteractiveNodeView({ node, deleteNode, updateAttributes, selected }: NodeViewProps) {
  const { interactiveId, title, align, width } = node.attrs as { interactiveId: string; title: string; align: string; width: string };
  const del = useConfirmDelete(deleteNode);
  const containerRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const startY = useRef(0);
  const startHeight = useRef(0);

  // Drag-to-resize width + height with ESC to cancel
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startX.current = e.clientX;
    startY.current = e.clientY;
    const origWidth = containerRef.current?.offsetWidth ?? 400;
    const origHeight = containerRef.current?.querySelector("iframe")?.parentElement?.offsetHeight ?? 300;
    startWidth.current = origWidth;
    startHeight.current = origHeight;
    const cleanup = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keydown", onEsc);
    };
    const onMouseMove = (ev: MouseEvent) => {
      const newWidth = Math.max(150, startWidth.current + (ev.clientX - startX.current));
      const newHeight = Math.max(100, startHeight.current + (ev.clientY - startY.current));
      updateAttributes({ width: `${Math.round(newWidth)}px`, height: `${Math.round(newHeight)}px` });
    };
    const onMouseUp = () => cleanup();
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        updateAttributes({ width: `${origWidth}px`, height: `${origHeight}px` });
        cleanup();
      }
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onEsc);
  };

  const effectiveWidth = width || "100%";
  const currentAlign = align || "center";
  const wrapperStyle: React.CSSProperties = currentAlign === "left"
    ? { float: "left", width: effectiveWidth, margin: "0.75rem 1.5rem 0.75rem 0" }
    : currentAlign === "right"
    ? { float: "right", width: effectiveWidth, margin: "0.75rem 0 0.75rem 1.5rem" }
    : { display: "flex", justifyContent: "center", margin: "0.75rem 0", clear: "both" };

  if (!interactiveId) {
    return (
      <NodeViewWrapper draggable contentEditable={false} style={{ ...wrapperStyle, position: "relative" }}>
        <DragHandle />
        <div style={{
          width: "100%", maxWidth: "700px", padding: "2rem", textAlign: "center",
          borderRadius: "8px", border: "2px dashed var(--border)",
          backgroundColor: "var(--card)", color: "var(--muted-foreground)", fontSize: "0.875rem",
        }}>
          Select an interactive…
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper draggable contentEditable={false} style={{ ...wrapperStyle, position: "relative" }}>
      <DragHandle />
      <div ref={containerRef} style={{
        width: (currentAlign === "left" || currentAlign === "right") ? "100%" : effectiveWidth, maxWidth: "700px", borderRadius: "8px",
        border: selected ? "2px solid #F7BB2E" : "1px solid #F7BB2E55",
        backgroundColor: "var(--card)", overflow: "hidden", position: "relative",
        transition: "border-color 150ms",
      }}>
        <div style={{ borderRadius: "6px 6px 0 0", overflow: "hidden", height: node.attrs.height || "300px" }}>
          <iframe
            src={`/api/interactives/${interactiveId}/preview`}
            style={{ width: "100%", height: "100%", border: "none" }}
            title={title || "Interactive preview"}
          />
        </div>
        {/* Footer bar — title + inline delete */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "0.2rem 0.375rem", borderTop: "1px solid var(--border)", backgroundColor: "var(--muted)", borderRadius: "0 0 6px 6px" }}>
          <span style={{ fontSize: "0.65rem", color: "#F7BB2E", fontWeight: 600, padding: "0 4px", flexShrink: 0 }}>⚡</span>
          <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", padding: "0 4px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title || "Interactive"}
          </span>
          {del.confirming ? (
            <>
              <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Remove?</span>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); del.confirm(); }}
                style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "none", background: "var(--destructive)", color: "#fff", cursor: "pointer", lineHeight: 1 }}>Yes</button>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); del.cancel(); }}
                style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}>No</button>
            </>
          ) : (
            <button type="button" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); del.request(); }}
              style={{ width: "18px", height: "18px", borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)", fontSize: "0.9rem", lineHeight: 1, flexShrink: 0 }}
              title="Remove interactive">×</button>
          )}
        </div>
        {/* Resize knob (same as Image) */}
        {selected && (
          <div
            title="Drag to resize"
            onMouseDown={handleResizeMouseDown}
            style={{
              position: "absolute", bottom: "28px", right: "4px",
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

const InteractiveEmbed = TipTapNode.create({
  name: "interactiveEmbed",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      interactiveId: { default: "" },
      title: { default: "" },
      align: { default: "" },
      width: { default: "" },
      height: { default: "" },
    };
  },

  parseHTML() {
    return [
      { tag: "cms-interactive[data-id]", getAttrs: (el) => ({
        interactiveId: (el as Element).getAttribute("data-id") ?? "",
        title: (el as Element).getAttribute("data-title") ?? "",
        align: (el as Element).getAttribute("data-align") ?? "",
        width: (el as Element).getAttribute("data-width") ?? "",
        height: (el as Element).getAttribute("data-height") ?? "",
      }) },
      // Legacy fallback for div-based format
      { tag: "div[data-interactive-embed]", getAttrs: (el) => ({
        interactiveId: (el as Element).getAttribute("data-interactive-embed") ?? "",
        title: (el as Element).getAttribute("data-interactive-title") ?? "",
        align: (el as Element).getAttribute("data-interactive-align") ?? "",
        width: (el as Element).getAttribute("data-interactive-width") ?? "",
        height: (el as Element).getAttribute("data-interactive-height") ?? "",
      }) },
    ];
  },

  renderHTML({ node }) {
    return ["cms-interactive", {
      "data-id": node.attrs.interactiveId,
      "data-title": node.attrs.title || undefined,
      "data-align": node.attrs.align || undefined,
      "data-width": node.attrs.width || undefined,
      "data-height": node.attrs.height || undefined,
    }];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: { write: (s: string) => void; closeBlock: (node: unknown) => void }, node: { attrs: Record<string, unknown> }) {
          const parts = [node.attrs.interactiveId];
          if (node.attrs.title) parts.push(node.attrs.title);
          else parts.push('');
          if (node.attrs.align && node.attrs.align !== 'center') parts.push(`align:${node.attrs.align}`);
          if (node.attrs.width) parts.push(`width:${node.attrs.width}`);
          if (node.attrs.height) parts.push(`height:${node.attrs.height}`);
          state.write(`!!INTERACTIVE[${parts.join('|')}]`);
          state.closeBlock(node);
        },
        parse: {
          updateDOM(dom: Element) {
            // Convert <p>!!INTERACTIVE[id|title|width:x|height:y]</p> → <cms-interactive>
            // Uses custom element to avoid ProseMirror treating <div> as generic container
            dom.querySelectorAll("p").forEach((p) => {
              const text = (p.textContent ?? "").trim();
              const m = text.match(/^!!INTERACTIVE\[([^\]]+)\]$/);
              if (!m) return;
              const parts = m[1].split("|");
              const id = parts[0];
              let title = "";
              let align = "";
              let width = "";
              let height = "";
              for (let i = 1; i < parts.length; i++) {
                if (parts[i].startsWith("align:")) align = parts[i].slice(6);
                else if (parts[i].startsWith("width:")) width = parts[i].slice(6);
                else if (parts[i].startsWith("height:")) height = parts[i].slice(7);
                else if (!title) title = parts[i];
              }
              const el = document.createElement("cms-interactive");
              el.setAttribute("data-id", id);
              if (title) el.setAttribute("data-title", title);
              if (align) el.setAttribute("data-align", align);
              if (width) el.setAttribute("data-width", width);
              if (height) el.setAttribute("data-height", height);
              p.parentNode?.replaceChild(el, p);
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
        if (node?.type.name !== "interactiveEmbed") return false;
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
        if (node?.type.name !== "interactiveEmbed") return false;
        const end = selection.from + node.nodeSize;
        editor.chain().insertContentAt(end, { type: "paragraph" }).setTextSelection(end + 1).run();
        return true;
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(InteractiveNodeView);
  },
});

/* ─── Map embed node + NodeView ────────────────────────────── */
function MapEmbedNodeView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const { address, zoom } = node.attrs as { address: string; zoom: string };
  const [editing, setEditing] = useState(!address);
  const [inputVal, setInputVal] = useState(address);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const del = useConfirmDelete(deleteNode);

  // Render Leaflet map when address is set
  useEffect(() => {
    if (!address || !mapContainerRef.current || mapInstanceRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      // @ts-expect-error — CSS import for side effects
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !mapContainerRef.current) return;

      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
          { headers: { "User-Agent": "webhouse-cms/1.0" } },
        );
        const results = await res.json();
        if (cancelled || !results.length || !mapContainerRef.current) return;

        const lat = parseFloat(results[0].lat);
        const lng = parseFloat(results[0].lon);
        const z = parseInt(zoom || "14", 10);

        const map = L.map(mapContainerRef.current, { center: [lat, lng], zoom: z, zoomControl: true, attributionControl: false });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
        const icon = L.icon({
          iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
          iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
          shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
          iconSize: [25, 41], iconAnchor: [12, 41],
        });
        L.marker([lat, lng], { icon }).addTo(map);
        mapInstanceRef.current = map;
      } catch { /* geocoding failed */ }
    })();

    return () => { cancelled = true; };
  }, [address, zoom]);

  // Cleanup map on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <NodeViewWrapper draggable style={{ margin: "0.75rem 0", position: "relative" }}>
      <DragHandle />
      <div style={{
        borderRadius: "8px", overflow: "hidden",
        border: selected ? "2px solid var(--primary)" : "1px solid var(--border)",
      }}>
        {address && !editing ? (
          <>
            <div ref={mapContainerRef} style={{ width: "100%", height: 250 }} />
            <div style={{
              padding: "0.375rem 0.75rem", fontSize: "0.72rem", color: "var(--muted-foreground)",
              background: "var(--card)", display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span>📍 {address}</span>
              <span style={{ display: "flex", gap: "0.25rem" }}>
                <button type="button" onClick={() => { setEditing(true); setInputVal(address); }}
                  style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}>
                  Edit
                </button>
                {del.confirming ? (
                  <>
                    <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Remove?</span>
                    <button type="button" onClick={del.confirm}
                      style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "none", background: "var(--destructive)", color: "#fff", cursor: "pointer", lineHeight: 1 }}>Yes</button>
                    <button type="button" onClick={del.cancel}
                      style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}>No</button>
                  </>
                ) : (
                  <button type="button" onClick={del.request}
                    style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", cursor: "pointer", lineHeight: 1 }}>×</button>
                )}
              </span>
            </div>
          </>
        ) : (
          <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", background: "var(--card)" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (inputVal.trim()) {
                // Destroy old map before re-rendering
                if (mapInstanceRef.current) {
                  (mapInstanceRef.current as { remove: () => void }).remove();
                  mapInstanceRef.current = null;
                }
                updateAttributes({ address: inputVal.trim() });
                setEditing(false);
              }
            }} style={{ display: "flex", gap: "0.25rem", width: "100%", maxWidth: 320 }}>
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="Address or place..."
                autoFocus
                style={{
                  flex: 1, padding: "0.35rem 0.5rem", fontSize: "0.8rem", borderRadius: "6px",
                  border: "1px solid var(--border)", background: "var(--background)",
                  color: "var(--foreground)", outline: "none",
                }}
              />
              <button type="submit" style={{
                padding: "0.35rem 0.75rem", borderRadius: "6px", border: "none",
                background: "#F7BB2E", color: "#0D0D0D", fontSize: "0.75rem",
                fontWeight: 600, cursor: "pointer",
              }}>
                Show
              </button>
            </form>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

const MapEmbed = TipTapNode.create({
  name: "mapEmbed",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      address: { default: "" },
      zoom:    { default: "14" },
    };
  },

  parseHTML() {
    return [
      { tag: "cms-map[data-address]", getAttrs: (el) => ({
        address: (el as Element).getAttribute("data-address") ?? "",
        zoom:    (el as Element).getAttribute("data-zoom") ?? "14",
      }) },
    ];
  },

  renderHTML({ node }) {
    return ["cms-map", {
      "data-address": node.attrs.address,
      "data-zoom": node.attrs.zoom,
    }];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: { write: (s: string) => void; closeBlock: (node: unknown) => void }, node: { attrs: Record<string, unknown> }) {
          const { address, zoom } = node.attrs as { address: string; zoom: string };
          state.write(`!!MAP[${address}|${zoom}]`);
          state.closeBlock(node);
        },
        parse: {
          updateDOM(dom: Element) {
            dom.querySelectorAll("p").forEach((p) => {
              const text = (p.textContent ?? "").trim();
              const m = text.match(/^!!MAP\[([^|]+)\|?(\d*)\]$/);
              if (!m) return;
              const el = document.createElement("cms-map");
              el.setAttribute("data-address", m[1]);
              el.setAttribute("data-zoom", m[2] || "14");
              p.parentNode?.replaceChild(el, p);
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
        if (node?.type.name !== "mapEmbed") return false;
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
        if (node?.type.name !== "mapEmbed") return false;
        const end = selection.from + node.nodeSize;
        editor.chain().insertContentAt(end, { type: "paragraph" }).setTextSelection(end + 1).run();
        return true;
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(MapEmbedNodeView);
  },
});

/* ─── File attachment node + NodeView ──────────────────────── */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileNodeView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const { src, filename, size } = node.attrs as {
    src: string; filename: string; size: string;
  };
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [mediaBrowserOpen, setMediaBrowserOpen] = useState(false);
  const [mediaItems, setMediaItems] = useState<Array<{ name: string; url: string; isImage: boolean; mediaType?: string; size: number }>>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaSearch, setMediaSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const del = useConfirmDelete(deleteNode);

  useEffect(() => {
    if (!mediaBrowserOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMediaBrowserOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mediaBrowserOpen]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "files");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const { url } = await res.json();
      updateAttributes({ src: url, filename: file.name, size: formatFileSize(file.size) });
    } finally {
      setUploading(false);
    }
  };

  const openMediaBrowser = () => {
    setMediaBrowserOpen(true);
    setMediaLoading(true);
    setMediaSearch("");
    fetch("/api/media")
      .then((r) => r.json())
      .then((items: Array<{ name: string; url: string; isImage: boolean; mediaType?: string; size: number }>) => {
        setMediaItems(items);
      })
      .catch(() => setMediaItems([]))
      .finally(() => setMediaLoading(false));
  };

  const mediaBrowserModal = mediaBrowserOpen && (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) setMediaBrowserOpen(false); }}
    >
      <div style={{
        background: "var(--popover)", border: "1px solid var(--border)",
        borderRadius: "12px", boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
        width: "min(640px, 90vw)", maxHeight: "70vh",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Modal header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)",
        }}>
          <span style={{ fontWeight: 500, fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <IconFile />
            Media Library
          </span>
          <button
            type="button"
            onClick={() => setMediaBrowserOpen(false)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "0.25rem", fontSize: "1.1rem", lineHeight: 1 }}
          >
            &times;
          </button>
        </div>
        {/* Search */}
        <div style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
          <input
            type="text"
            value={mediaSearch}
            onChange={(e) => setMediaSearch(e.target.value)}
            placeholder="Search files..."
            autoFocus
            style={{
              width: "100%", padding: "0.35rem 0.5rem",
              borderRadius: "6px", border: "1px solid var(--border)",
              background: "var(--background)", color: "var(--foreground)",
              fontSize: "0.8rem", outline: "none",
            }}
          />
        </div>
        {/* Modal body */}
        <div style={{ overflowY: "auto", padding: "0.75rem" }}>
          {mediaLoading && (
            <div style={{ padding: "2rem", textAlign: "center", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
              Loading media...
            </div>
          )}
          {!mediaLoading && mediaItems.length === 0 && (
            <div style={{ padding: "2rem", textAlign: "center", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
              No files found in Media library
            </div>
          )}
          {!mediaLoading && mediaItems.length > 0 && (() => {
            const filtered = mediaItems.filter((item) => !mediaSearch || item.name.toLowerCase().includes(mediaSearch.toLowerCase()));
            if (filtered.length === 0) return (
              <div style={{ padding: "2rem", textAlign: "center", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
                No files match &ldquo;{mediaSearch}&rdquo;
              </div>
            );
            return (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
                gap: "0.5rem",
              }}>
                {filtered.map((item) => (
                  <button
                    key={item.url}
                    type="button"
                    onClick={() => {
                      let storedUrl = item.url;
                      try { const u = new URL(item.url); storedUrl = u.pathname; } catch { /* already relative */ }
                      const sizeStr = item.size ? formatFileSize(item.size) : "";
                      updateAttributes({ src: storedUrl, filename: item.name, size: sizeStr });
                      setMediaBrowserOpen(false);
                    }}
                    style={{
                      background: "none",
                      border: "1px solid var(--border)",
                      borderRadius: "6px", cursor: "pointer",
                      padding: "0.25rem", display: "flex",
                      flexDirection: "column", alignItems: "center",
                      gap: "0.25rem", overflow: "hidden",
                    }}
                    className="hover:border-primary transition-colors"
                    title={item.name}
                  >
                    {item.isImage ? (
                      <img src={item.url} alt={item.name}
                        style={{ width: "100%", height: "80px", objectFit: "cover", borderRadius: "4px" }} />
                    ) : (
                      <div style={{
                        width: "100%", height: "80px", display: "flex",
                        flexDirection: "column", alignItems: "center", justifyContent: "center",
                        gap: "0.25rem", color: "var(--muted-foreground)", borderRadius: "4px",
                        background: "var(--muted)",
                      }}>
                        <IconFile />
                        <span style={{ fontSize: "0.55rem", textTransform: "uppercase", fontWeight: 600, opacity: 0.7 }}>
                          {item.mediaType ?? item.name.split(".").pop() ?? "file"}
                        </span>
                      </div>
                    )}
                    <span style={{
                      fontSize: "0.6rem", color: "var(--muted-foreground)",
                      overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap", width: "100%", textAlign: "center",
                    }}>
                      {item.name}
                    </span>
                    {item.size > 0 && (
                      <span style={{ fontSize: "0.5rem", color: "var(--muted-foreground)", opacity: 0.7 }}>
                        {formatFileSize(item.size)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );

  if (!src) {
    const btnStyle: React.CSSProperties = {
      display: "inline-flex", alignItems: "center", gap: "0.35rem",
      padding: "0.5rem 0.85rem", borderRadius: "6px",
      border: "1px solid var(--border)", background: "var(--card)",
      cursor: "pointer", fontSize: "0.8rem", color: "var(--muted-foreground)",
      transition: "border-color 150ms, color 150ms",
    };
    return (
      <NodeViewWrapper draggable contentEditable={false} style={{ margin: "0.75rem 0", position: "relative" }}>
        <DragHandle />
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleUpload(f); }}
          style={{
            width: "100%", maxWidth: "400px", padding: "1.5rem", textAlign: "center",
            borderRadius: "8px", border: `2px dashed ${dragOver ? "var(--primary)" : "var(--border)"}`,
            backgroundColor: dragOver ? "rgba(255,255,255,0.04)" : "var(--card)",
            color: "var(--muted-foreground)", fontSize: "0.875rem",
            transition: "border-color 150ms, background 150ms",
            display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem",
          }}
        >
          {uploading ? "Uploading..." : (
            <>
              <span style={{ fontSize: "0.8rem" }}>Drop file here or</span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button type="button" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
                  style={btnStyle} className="hover:border-primary hover:text-primary">
                  <IconAttachment /> Upload file
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); openMediaBrowser(); }}
                  style={btnStyle} className="hover:border-primary hover:text-primary">
                  <IconFile /> Browse Media
                </button>
              </div>
            </>
          )}
          <input ref={fileRef} type="file" accept="*" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />
        </div>
        {mediaBrowserModal}
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper draggable contentEditable={false} style={{ margin: "0.25rem 0", position: "relative" }}>
      <DragHandle />
      <div style={{
        display: "inline-flex", flexDirection: "column", borderRadius: "8px",
        border: selected ? "2px solid var(--primary)" : "1px solid var(--border)",
        backgroundColor: "var(--card)", maxWidth: "100%", overflow: "hidden",
        transition: "border-color 150ms",
      }}>
        {/* File info area */}
        <div style={{
          display: "flex", alignItems: "center", gap: "0.75rem",
          padding: "0.625rem 0.875rem",
        }}>
          <span style={{ color: "var(--muted-foreground)", flexShrink: 0 }}><IconFile /></span>
          <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
            <p style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", margin: 0 }}>{filename}</p>
            {size && <p style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", margin: 0 }}>{size}</p>}
          </div>
        </div>
        {/* Footer bar — download + delete (matches Image/Video/Int pattern) */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "0.15rem 0.375rem", borderTop: "1px solid var(--border)", backgroundColor: "var(--muted)" }}>
          <span style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", padding: "0 4px", opacity: 0.6, flex: 1 }}>File</span>
          <a href={src} download={filename} target="_blank" rel="noopener noreferrer"
            onMouseDown={(e) => e.stopPropagation()}
            style={{ width: "18px", height: "18px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)", flexShrink: 0 }}
            title="Download">
            <IconDownload />
          </a>
          {del.confirming ? (
            <>
              <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Remove?</span>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); del.confirm(); }}
                style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "none", background: "var(--destructive)", color: "#fff", cursor: "pointer", lineHeight: 1 }}>Yes</button>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); del.cancel(); }}
                style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}>No</button>
            </>
          ) : (
            <button type="button" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); del.request(); }}
              style={{ width: "18px", height: "18px", borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)", fontSize: "0.9rem", lineHeight: 1, flexShrink: 0 }}
              title="Remove file">×</button>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

const FileAttachment = TipTapNode.create({
  name: "fileAttachment",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src:      { default: "" },
      filename: { default: "" },
      size:     { default: "" },
    };
  },

  parseHTML() {
    return [
      { tag: "cms-file[data-src]", getAttrs: (el) => ({
        src:      (el as Element).getAttribute("data-src") ?? "",
        filename: (el as Element).getAttribute("data-name") ?? "",
        size:     (el as Element).getAttribute("data-size") ?? "",
      }) },
      // Legacy fallback
      { tag: "div[data-file-attachment]", getAttrs: (el) => ({
        src:      (el as Element).getAttribute("data-file-attachment") ?? "",
        filename: (el as Element).getAttribute("data-file-name") ?? "",
        size:     (el as Element).getAttribute("data-file-size") ?? "",
      }) },
    ];
  },

  renderHTML({ node }) {
    return ["cms-file", {
      "data-src": node.attrs.src,
      "data-name": node.attrs.filename || undefined,
      "data-size": node.attrs.size || undefined,
    }];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: { write: (s: string) => void; closeBlock: (node: unknown) => void }, node: { attrs: Record<string, unknown> }) {
          const { src, filename } = node.attrs as { src: string; filename: string };
          const { size } = node.attrs as { size: number };
          state.write(`!!FILE[${src}|${filename}|${size || 0}]`);
          state.closeBlock(node);
        },
        parse: {
          updateDOM(dom: Element) {
            // Convert <p>!!FILE[src|filename|size]</p> → <cms-file>
            dom.querySelectorAll("p").forEach((p) => {
              const text = (p.textContent ?? "").trim();
              const m = text.match(/^!!FILE\[([^|]+)\|([^|]*)\|?(.*?)\]$/);
              if (!m) return;
              const el = document.createElement("cms-file");
              el.setAttribute("data-src", m[1]);
              el.setAttribute("data-name", m[2] || "");
              el.setAttribute("data-size", m[3] || "0");
              p.parentNode?.replaceChild(el, p);
            });
            // Also handle legacy <!-- file:... --> comments
            const cWalker = document.createTreeWalker(dom, NodeFilter.SHOW_COMMENT);
            const comments: Comment[] = [];
            while (cWalker.nextNode()) comments.push(cWalker.currentNode as Comment);
            for (const c of comments) {
              const m = c.textContent?.trim().match(/^file:([^|]+)\|([^|]*)\|?(.*)$/);
              if (m) {
                const el = document.createElement("cms-file");
                el.setAttribute("data-src", m[1]);
                el.setAttribute("data-name", m[2] || "");
                el.setAttribute("data-size", m[3] || "0");
                c.parentNode?.replaceChild(el, c);
              }
            }
            // Also handle legacy <a download> tags
            dom.querySelectorAll("a[download]").forEach((a) => {
              const src = a.getAttribute("href") ?? "";
              const filename = a.textContent ?? "";
              const el = document.createElement("cms-file");
              el.setAttribute("data-src", src);
              el.setAttribute("data-name", filename);
              a.parentNode?.replaceChild(el, a);
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
        if (node?.type.name !== "fileAttachment") return false;
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
        if (node?.type.name !== "fileAttachment") return false;
        const end = selection.from + node.nodeSize;
        editor.chain().insertContentAt(end, { type: "paragraph" }).setTextSelection(end + 1).run();
        return true;
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileNodeView);
  },
});

/* ─── Callout node + NodeView ──────────────────────────────── */
type CalloutVariant = "info" | "warning" | "tip";

const CALLOUT_STYLES: Record<CalloutVariant, { border: string; bg: string; icon: string }> = {
  info:    { border: "#3b82f6", bg: "rgba(59,130,246,0.08)", icon: "ℹ️" },
  warning: { border: "#f59e0b", bg: "rgba(245,158,11,0.08)", icon: "⚠️" },
  tip:     { border: "#22c55e", bg: "rgba(34,197,94,0.08)",  icon: "💡" },
};

function CalloutNodeView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const variant = (node.attrs.variant as CalloutVariant) || "info";
  const style = CALLOUT_STYLES[variant];
  const del = useConfirmDelete(deleteNode);

  const btnVariant = (v: CalloutVariant, label: string) => (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); updateAttributes({ variant: v }); }}
      style={{
        fontSize: "0.65rem", padding: "0.1rem 0.4rem", borderRadius: "3px",
        border: variant === v ? `1px solid ${CALLOUT_STYLES[v].border}` : "1px solid var(--border)",
        cursor: "pointer", lineHeight: 1.4,
        background: variant === v ? CALLOUT_STYLES[v].bg : "transparent",
        color: variant === v ? CALLOUT_STYLES[v].border : "var(--muted-foreground)",
        fontWeight: variant === v ? 600 : 400,
      }}
    >{label}</button>
  );

  const btnSm: React.CSSProperties = { fontSize: "0.7rem", padding: "0.15rem 0.4rem", borderRadius: "3px", border: "1px solid var(--border)", cursor: "pointer", background: "transparent", color: "var(--foreground)", lineHeight: 1 };

  return (
    <NodeViewWrapper draggable style={{ margin: "0.75rem 0", position: "relative" }}>
      <DragHandle />
      <div style={{
        borderLeft: `4px solid ${style.border}`,
        backgroundColor: style.bg,
        borderRadius: "0 8px 8px 0",
        padding: "0",
        outline: selected ? `2px solid var(--primary)` : "none",
        outlineOffset: "2px",
        transition: "outline 150ms",
      }}>
        {/* Variant selector bar */}
        <div contentEditable={false} style={{ display: "flex", alignItems: "center", gap: "4px", padding: "0.35rem 0.75rem", borderBottom: `1px solid ${style.border}22`, userSelect: "none" }}>
          <span style={{ fontSize: "0.8rem", lineHeight: 1 }}>{style.icon}</span>
          <span style={{ fontSize: "0.65rem", color: style.border, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginRight: "auto" }}>{variant}</span>
          {btnVariant("info", "Info")}
          {btnVariant("warning", "Warning")}
          {btnVariant("tip", "Tip")}
          {del.confirming ? (
            <>
              <span style={{ fontSize: "0.7rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Remove?</span>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); del.confirm(); }} style={{ ...btnSm, background: "var(--destructive)", color: "#fff", border: "none", fontSize: "0.65rem" }}>Yes</button>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); del.cancel(); }} style={{ ...btnSm, fontSize: "0.65rem" }}>No</button>
            </>
          ) : (
            <button type="button" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); del.request(); }}
              style={{ width: "16px", height: "16px", borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)", fontSize: "0.8rem", lineHeight: 1, flexShrink: 0 }}
              title="Remove callout">×</button>
          )}
        </div>
        {/* Editable content area */}
        <div data-node-view-content="" style={{ padding: "0.5rem 0.75rem 0.75rem" }} />
      </div>
    </NodeViewWrapper>
  );
}

const Callout = TipTapNode.create({
  name: "callout",
  group: "block",
  content: "paragraph+",
  draggable: true,

  addAttributes() {
    return {
      variant: { default: "info", parseHTML: el => el.getAttribute("data-callout-variant") || "info" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-callout]", getAttrs: (el) => ({
      variant: (el as Element).getAttribute("data-callout-variant") || "info",
    }) }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-callout": "", "data-callout-variant": node.attrs.variant }, 0];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: { write: (s: string) => void; closeBlock: (node: unknown) => void; renderContent: (node: unknown) => void; out: string }, node: { attrs: Record<string, unknown>; content: { forEach: (cb: (child: unknown) => void) => void } }) {
          const variant = (node.attrs.variant as string || "info").toUpperCase();
          state.write(`> [!${variant}]`);
          state.write("\n");
          // Serialize child paragraphs as "> content"
          node.content.forEach((child: unknown) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const c = child as any;
            if (c.type?.name === "paragraph") {
              let text = "";
              if (c.content) {
                c.content.forEach((inline: { text?: string; type?: { name: string }; marks?: { type: { name: string }; attrs?: Record<string, string> }[] }) => {
                  let t = inline.text ?? "";
                  if (inline.marks) {
                    for (const mark of inline.marks) {
                      if (mark.type.name === "bold") t = `**${t}**`;
                      else if (mark.type.name === "italic") t = `*${t}*`;
                      else if (mark.type.name === "code") t = `\`${t}\``;
                      else if (mark.type.name === "link") t = `[${t}](${mark.attrs?.href ?? ""})`;
                    }
                  }
                  text += t;
                });
              }
              state.write(`> ${text}`);
              state.write("\n");
            }
          });
          state.closeBlock(node);
        },
        parse: {
          updateDOM(dom: Element) {
            // Convert GitHub-style alerts: > [!INFO] / > [!WARNING] / > [!TIP]
            dom.querySelectorAll("blockquote").forEach((bq) => {
              const firstP = bq.querySelector("p");
              if (!firstP) return;
              const text = firstP.textContent ?? "";
              const match = text.match(/^\[!(INFO|WARNING|TIP)\]\s*/i);
              if (!match) return;
              const variant = match[1].toLowerCase();
              // Remove the marker text from the first paragraph
              firstP.textContent = text.slice(match[0].length);
              if (!firstP.textContent.trim()) {
                // If marker was the only content in this p, remove it
                firstP.remove();
              }
              // Replace blockquote with callout div
              const div = document.createElement("div");
              div.setAttribute("data-callout", "");
              div.setAttribute("data-callout-variant", variant);
              // Move remaining children
              while (bq.firstChild) div.appendChild(bq.firstChild);
              // Ensure at least one paragraph child
              if (!div.querySelector("p")) {
                const p = document.createElement("p");
                div.appendChild(p);
              }
              bq.parentNode?.replaceChild(div, bq);
            });
          },
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutNodeView);
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
function RichTextEditorInner({ value, onChange, disabled, stickyOffset = 132, features }: Props) {
  // Feature check: if features whitelist is set, only show those toolbar items
  const has = (feature: string) => !features || features.includes(feature);
  const creatingRef = useRef(true); // suppress onChange during onCreate
  const lastValueRef = useRef(value || ""); // track last value to skip no-op onChange
  const [headingOpen, setHeadingOpen] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const highlightRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(100);
  const [blockPickerOpen, setBlockPickerOpen] = useState(false);
  const [blockSearch, setBlockSearch] = useState("");
  const [replacePos, setReplacePos] = useState<number | null>(null);
  const [availableBlocks, setAvailableBlocks] = useState<{ slug: string; label: string; blockType: string }[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [showInteractivePicker, setShowInteractivePicker] = useState(false);
  const [showVideoDialog, setShowVideoDialog] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [intSearch, setIntSearch] = useState("");
  const [availableInteractives, setAvailableInteractives] = useState<{ id: string; title: string }[]>([]);
  const [interactivesLoading, setInteractivesLoading] = useState(false);
  const headingRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showAudioPicker, setShowAudioPicker] = useState(false);
  const [showImageMediaBrowser, setShowImageMediaBrowser] = useState(false);
  const [showAudioMediaBrowser, setShowAudioMediaBrowser] = useState(false);
  const [mediaBrowserItems, setMediaBrowserItems] = useState<Array<{ name: string; url: string; isImage: boolean; mediaType?: string; size: number }>>([]);
  const [mediaBrowserLoading, setMediaBrowserLoading] = useState(false);
  const [mediaBrowserSearch, setMediaBrowserSearch] = useState("");
  const [mediaBrowserPage, setMediaBrowserPage] = useState(1);
  const [mediaBrowserAiMeta, setMediaBrowserAiMeta] = useState<Record<string, { caption?: string; alt?: string; tags?: string[] }>>({});
  const imagePickerRef = useRef<HTMLDivElement>(null);
  const audioPickerRef = useRef<HTMLDivElement>(null);
  const [showMediaDropdown, setShowMediaDropdown] = useState(false);
  const [mediaSubMenu, setMediaSubMenu] = useState<"image" | "audio" | "map" | null>(null);
  const mediaDropdownRef = useRef<HTMLDivElement>(null);
  const [showSource, setShowSource] = useState(false);
  const [sourceText, setSourceText] = useState("");

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    extensions: [
      StarterKit.configure({
        link: false,       // configured separately below
      }),
      Placeholder.configure({ placeholder: "Start writing…" }),
      TipTapLink.configure({ openOnClick: false }),
      Superscript,
      Subscript,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Highlight.configure({ multicolor: true }),
      Color,
      ResizableImage.configure({ inline: false }),
      BlockMarker,
      VideoEmbed,
      AudioEmbed,
      FileAttachment,
      MapEmbed,
      InteractiveEmbed,
      Callout,
      TextDragDrop,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Markdown.configure({ html: true, transformPastedText: true }),
    ],
    content: value || "",
    editable: !disabled,
    onCreate: ({ editor }) => {
      creatingRef.current = true;
      // Fallback: scan for paragraphs containing !!INTERACTIVE[...] or !!FILE[...]
      // text that survived markdown parsing, and convert them to proper embed nodes.
      // Collect replacements from end to start to preserve positions.
      const { doc } = editor.state;
      const replacements: { pos: number; end: number; node: typeof doc }[] = [];
      doc.descendants((node, pos) => {
        if (node.type.name !== "paragraph") return;
        const text = node.textContent;
        const intMatch = text.match(/^!!INTERACTIVE\[([^\]]+)\]$/);
        if (intMatch) {
          const parts = intMatch[1].split("|");
          const id = parts[0];
          let title = "", alignVal = "", widthVal = "", heightVal = "";
          for (let i = 1; i < parts.length; i++) {
            if (parts[i].startsWith("align:")) alignVal = parts[i].slice(6);
            else if (parts[i].startsWith("width:")) widthVal = parts[i].slice(6);
            else if (parts[i].startsWith("height:")) heightVal = parts[i].slice(7);
            else if (!title) title = parts[i];
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          replacements.push({ pos, end: pos + node.nodeSize, node: editor.schema.nodes.interactiveEmbed.create({ interactiveId: id, title, align: alignVal, width: widthVal, height: heightVal }) as any });
        }
      });
      if (replacements.length > 0) {
        const tr = editor.state.tr;
        // Apply from end to start so positions stay valid
        for (const r of replacements.reverse()) {
          tr.replaceWith(r.pos, r.end, r.node);
        }
        editor.view.dispatch(tr);
      }
      // Allow onUpdate to fire normally after onCreate completes
      requestAnimationFrame(() => { creatingRef.current = false; });
    },
    onUpdate: ({ editor }) => {
      if (creatingRef.current) return;
      const md = (editor.storage as any).markdown.getMarkdown();
      if (md === lastValueRef.current) return; // skip if content didn't actually change
      lastValueRef.current = md;
      onChange(md);
    },
    editorProps: {
      attributes: {
        class: "rte outline-none min-h-[120px]",
        // Block browser extensions (Grammarly, spell-checkers) from injecting
        // DOM nodes that break React's reconciliation with ProseMirror
        "data-gramm": "false",
        "data-gramm_editor": "false",
        "data-enable-grammarly": "false",
        translate: "no",
      },
    },
  });

  // Reactive toolbar state — updates on cursor move and selection change
  const toolbarState = useEditorState({
    editor,
    selector: (ctx) => ({
      isImage: ctx.editor?.isActive("image") ?? false,
      imageSrc: (ctx.editor?.isActive("image")
        ? (ctx.editor?.getAttributes("image").src as string | undefined) ?? null
        : null) as string | null,
      imageAlt: (ctx.editor?.isActive("image")
        ? (ctx.editor?.getAttributes("image").alt as string | undefined) ?? ""
        : "") as string,
      imageAlign: (ctx.editor?.isActive("image")
        ? (ctx.editor?.getAttributes("image").align as string | undefined) ?? "center"
        : null) as string | null,
      isVideo: ctx.editor?.isActive("videoEmbed") ?? false,
      videoAlign: (ctx.editor?.isActive("videoEmbed")
        ? (ctx.editor?.getAttributes("videoEmbed").align as string | undefined) ?? "center"
        : null) as string | null,
      isAudio: ctx.editor?.isActive("audioEmbed") ?? false,
      audioAlign: (ctx.editor?.isActive("audioEmbed")
        ? (ctx.editor?.getAttributes("audioEmbed").align as string | undefined) ?? "center"
        : null) as string | null,
      isInteractive: ctx.editor?.isActive("interactiveEmbed") ?? false,
      interactiveAlign: (ctx.editor?.isActive("interactiveEmbed")
        ? (ctx.editor?.getAttributes("interactiveEmbed").align as string | undefined) ?? "center"
        : null) as string | null,
      isFile: ctx.editor?.isActive("fileAttachment") ?? false,
      isCallout: ctx.editor?.isActive("callout") ?? false,
      calloutVariant: (ctx.editor?.isActive("callout")
        ? (ctx.editor?.getAttributes("callout").variant as string | undefined) ?? "info"
        : null) as string | null,
      // Mark states for toolbar reactivity (v3: no auto-rerender on transaction)
      isBold: ctx.editor?.isActive("bold") ?? false,
      isItalic: ctx.editor?.isActive("italic") ?? false,
      isStrike: ctx.editor?.isActive("strike") ?? false,
      isCode: ctx.editor?.isActive("code") ?? false,
      isBulletList: ctx.editor?.isActive("bulletList") ?? false,
      isOrderedList: ctx.editor?.isActive("orderedList") ?? false,
      isBlockquote: ctx.editor?.isActive("blockquote") ?? false,
      isCodeBlock: ctx.editor?.isActive("codeBlock") ?? false,
      isLink: ctx.editor?.isActive("link") ?? false,
      isTable: ctx.editor?.isActive("table") ?? false,
      isUnderline: ctx.editor?.isActive("underline") ?? false,
      isSuperscript: ctx.editor?.isActive("superscript") ?? false,
      isSubscript: ctx.editor?.isActive("subscript") ?? false,
      isHighlight: ctx.editor?.isActive("highlight") ?? false,
      textAlign: (ctx.editor?.isActive({ textAlign: "center" }) ? "center"
        : ctx.editor?.isActive({ textAlign: "right" }) ? "right"
        : "left") as string,
      headingLevel: (ctx.editor?.isActive("heading")
        ? (ctx.editor?.getAttributes("heading").level as number) ?? 0
        : 0) as number,
    }),
  });

  // Sync value prop → editor content.
  // Runs on mount (when editor becomes available) and when value changes externally.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    // Don't overwrite while user is actively typing
    if (editor.isFocused) return;
    const current = (editor.storage as any).markdown.getMarkdown();
    if (value !== current) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (headingRef.current && !headingRef.current.contains(e.target as Node)) setHeadingOpen(false);
      if (linkRef.current && !linkRef.current.contains(e.target as Node)) setLinkOpen(false);
      if (imagePickerRef.current && !imagePickerRef.current.contains(e.target as Node)) setShowImagePicker(false);
      if (audioPickerRef.current && !audioPickerRef.current.contains(e.target as Node)) setShowAudioPicker(false);
      if (mediaDropdownRef.current && !mediaDropdownRef.current.contains(e.target as Node)) { setShowMediaDropdown(false); setMediaSubMenu(null); }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!showInteractivePicker) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowInteractivePicker(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showInteractivePicker]);

  useEffect(() => {
    if (!showImageMediaBrowser) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowImageMediaBrowser(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showImageMediaBrowser]);

  useEffect(() => {
    if (!showAudioMediaBrowser) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowAudioMediaBrowser(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showAudioMediaBrowser]);

  function activeKey(): HeadingKey {
    if (!editor) return "paragraph";
    if (toolbarState?.headingLevel === 1) return "h1";
    if (toolbarState?.headingLevel === 2) return "h2";
    if (toolbarState?.headingLevel === 3) return "h3";
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

  function openImageMediaBrowser() {
    setShowImagePicker(false);
    setShowImageMediaBrowser(true);
    setMediaBrowserLoading(true);
    setMediaBrowserSearch("");
    fetch("/api/media")
      .then((r) => r.json())
      .then((items: Array<{ name: string; url: string; isImage: boolean; mediaType?: string; size: number }>) => {
        // Filter out WebP variants (e.g. hero-400w.webp) — only show originals
        setMediaBrowserItems(items.filter((i) => i.isImage && !/-\d+w\.webp$/i.test(i.name)));
      })
      .catch(() => setMediaBrowserItems([]))
      .finally(() => setMediaBrowserLoading(false));
    // Also fetch AI metadata for search
    fetch("/api/media/ai-analyzed?meta=1")
      .then((r) => r.json())
      .then((data) => {
        if (data?.meta) setMediaBrowserAiMeta(data.meta);
      })
      .catch(() => {});
  }

  function openAudioMediaBrowser() {
    setShowAudioPicker(false);
    setShowAudioMediaBrowser(true);
    setMediaBrowserLoading(true);
    setMediaBrowserSearch("");
    fetch("/api/media")
      .then((r) => r.json())
      .then((items: Array<{ name: string; url: string; isImage: boolean; mediaType?: string; size: number }>) => {
        setMediaBrowserItems(items.filter((i) => i.mediaType === "audio"));
      })
      .catch(() => setMediaBrowserItems([]))
      .finally(() => setMediaBrowserLoading(false));
  }

  /** Try to auto-fill alt text from AI metadata for a just-inserted image.
   *  Picks per-locale alt when available (reads doc locale from closest form context). */
  const tryAutoFillAlt = useCallback((imageUrl: string) => {
    if (!editor) return;
    fetch(`/api/media/ai-meta?file=${encodeURIComponent(imageUrl)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data) return;
        // Pick best alt: per-locale > legacy single field
        // Read doc locale from the editor form's data attribute (set by document-editor)
        const docLocale = document.querySelector<HTMLElement>("[data-doc-locale]")?.dataset.docLocale;
        let bestAlt: string | null = null;
        if (docLocale && data.alts?.[docLocale]) {
          bestAlt = data.alts[docLocale];
        } else if (data.alt) {
          bestAlt = data.alt;
        } else if (data.alts) {
          bestAlt = Object.values(data.alts)[0] as string ?? null;
        }
        if (!bestAlt) return;
        // Find the image node with this src and update its alt
        const { doc } = editor.state;
        let found = false;
        doc.descendants((node, pos) => {
          if (found) return false;
          if (node.type.name === "image" && node.attrs.src === imageUrl) {
            const currentAlt = node.attrs.alt ?? "";
            const filename = imageUrl.split("/").pop() ?? "";
            if (!currentAlt || currentAlt === filename) {
              editor.chain().command(({ tr }) => {
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, alt: bestAlt });
                return true;
              }).run();
            }
            found = true;
          }
        });
      })
      .catch(() => { /* ignore — alt fill is best-effort */ });
  }, [editor]);

  const uploadImage = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const { url } = await res.json();
      editor?.chain().focus().setImage({ src: url, alt: file.name }).run();
      tryAutoFillAlt(url);
    } finally {
      setUploading(false);
    }
  }, [editor, tryAutoFillAlt]);

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
    (editor.storage as any).blockMarker = (editor.storage as any).blockMarker ?? {};
    (editor.storage as any).blockMarker.openPicker = (pos: number) => {
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
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "2px", padding: "0.375rem 0.75rem", borderBottom: "1px solid var(--border)", position: "sticky", top: stickyOffset, zIndex: 20, backgroundColor: "var(--background)", borderRadius: "0.5rem 0.5rem 0 0" }}>

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

            {has("bold") && <Btn tooltip="Bold (⌘B)" active={toolbarState?.isBold ?? false}
              onClick={() => editor.chain().focus().toggleBold().run()}>
              <IconBold />
            </Btn>}
            {has("italic") && <Btn tooltip="Italic (⌘I)" active={toolbarState?.isItalic ?? false}
              onClick={() => editor.chain().focus().toggleItalic().run()}>
              <IconItalic />
            </Btn>}
            {has("strike") && <Btn tooltip="Strikethrough (⌘⇧S)" active={toolbarState?.isStrike ?? false}
              onClick={() => editor.chain().focus().toggleStrike().run()}>
              <IconStrikethrough />
            </Btn>}
            {has("underline") && <Btn tooltip="Underline (⌘U)" active={toolbarState?.isUnderline ?? false}
              onClick={() => editor.chain().focus().toggleUnderline().run()}>
              <IconUnderline />
            </Btn>}
            {has("code") && <Btn tooltip="Inline code" active={toolbarState?.isCode ?? false}
              onClick={() => editor.chain().focus().toggleCode().run()}>
              <IconCode />
            </Btn>}
            {has("superscript") && <Btn tooltip="Superscript (⌘.)" active={toolbarState?.isSuperscript ?? false}
              onClick={() => editor.chain().focus().toggleSuperscript().run()}>
              <IconSuperscript />
            </Btn>}
            {has("subscript") && <Btn tooltip="Subscript (⌘,)" active={toolbarState?.isSubscript ?? false}
              onClick={() => editor.chain().focus().toggleSubscript().run()}>
              <IconSubscript />
            </Btn>}

            {(has("bold") || has("italic") || has("strike") || has("code")) && <Sep />}

            {has("bulletList") && <Btn tooltip="Bullet list" active={toolbarState?.isBulletList ?? false}
              onClick={() => editor.chain().focus().toggleBulletList().run()}>
              <IconBulletList />
            </Btn>}
            {has("orderedList") && <Btn tooltip="Numbered list" active={toolbarState?.isOrderedList ?? false}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}>
              <IconNumberedList />
            </Btn>}
            {has("blockquote") && <Btn tooltip="Blockquote" active={toolbarState?.isBlockquote ?? false}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}>
              <IconBlockquote />
            </Btn>}
            {has("horizontalRule") && <Btn tooltip="Horizontal rule"
              onClick={() => editor.chain().focus().setHorizontalRule().run()}>
              <IconHorizontalRule />
            </Btn>}

            {(has("bulletList") || has("orderedList") || has("blockquote") || has("horizontalRule")) && <Sep />}

            {/* Text alignment */}
            {has("textAlign") && <>
              <Btn tooltip="Align left" active={(toolbarState?.textAlign ?? "left") === "left"}
                onClick={() => editor.chain().focus().setTextAlign("left").run()}>
                <IconAlignLeft />
              </Btn>
              <Btn tooltip="Align center" active={toolbarState?.textAlign === "center"}
                onClick={() => editor.chain().focus().setTextAlign("center").run()}>
                <IconAlignCenter />
              </Btn>
              <Btn tooltip="Align right" active={toolbarState?.textAlign === "right"}
                onClick={() => editor.chain().focus().setTextAlign("right").run()}>
                <IconAlignRight />
              </Btn>
              <Sep />
            </>}

            {/* Link */}
            {has("link") && <div style={{ position: "relative" }} ref={linkRef}>
              <Btn tooltip="Link (⌘K)" active={toolbarState?.isLink ?? false}
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
            </div>}

            {/* Highlight */}
            {has("highlight") && <div style={{ position: "relative" }} ref={highlightRef}>
              <Btn tooltip="Highlight" active={toolbarState?.isHighlight ?? false}
                onClick={() => setHighlightOpen(o => !o)}>
                <IconHighlight />
              </Btn>
              {highlightOpen && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, zIndex: 50,
                  display: "flex", gap: "4px", padding: "6px 8px",
                  background: "var(--popover)", border: "1px solid var(--border)",
                  borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                  marginTop: "4px",
                }}>
                  {[
                    { color: "#bbf7d0", label: "Green" },
                    { color: "#bfdbfe", label: "Blue" },
                    { color: "#fde68a", label: "Yellow" },
                    { color: "#fecaca", label: "Red" },
                    { color: "#e9d5ff", label: "Purple" },
                    { color: "#fed7aa", label: "Orange" },
                  ].map(({ color, label }) => (
                    <button key={color} type="button" title={label}
                      onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHighlight({ color }).run(); setHighlightOpen(false); }}
                      style={{
                        width: 22, height: 22, borderRadius: "50%",
                        background: color, border: "2px solid transparent",
                        cursor: "pointer",
                        outline: (toolbarState?.isHighlight && editor.getAttributes("highlight").color === color) ? "2px solid var(--foreground)" : "none",
                        outlineOffset: "1px",
                      }} />
                  ))}
                  <button type="button" title="Clear highlight"
                    onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().unsetHighlight().run(); setHighlightOpen(false); }}
                    style={{
                      width: 22, height: 22, borderRadius: "50%",
                      background: "transparent", border: "2px solid var(--border)",
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.7rem", color: "var(--muted-foreground)",
                    }}>⌀</button>
                </div>
              )}
            </div>}

            {/* Table */}
            {has("table") && <Btn tooltip="Insert table" active={toolbarState?.isTable ?? false}
              onClick={insertTable}>
              <IconTable />
            </Btn>}
            {has("table") && (toolbarState?.isTable ?? false) && (
              <>
                <Btn tooltip="Add column before" onClick={() => editor.chain().focus().addColumnBefore().run()}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="3" width="12" height="18" rx="1"/><line x1="5" y1="9" x2="5" y2="15"/><line x1="2" y1="12" x2="8" y2="12"/></svg>
                </Btn>
                <Btn tooltip="Add column after" onClick={() => editor.chain().focus().addColumnAfter().run()}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="12" height="18" rx="1"/><line x1="19" y1="9" x2="19" y2="15"/><line x1="16" y1="12" x2="22" y2="12"/></svg>
                </Btn>
                <Btn tooltip="Add row before" onClick={() => editor.chain().focus().addRowBefore().run()}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="9" width="18" height="12" rx="1"/><line x1="9" y1="5" x2="15" y2="5"/><line x1="12" y1="2" x2="12" y2="8"/></svg>
                </Btn>
                <Btn tooltip="Add row after" onClick={() => editor.chain().focus().addRowAfter().run()}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="12" rx="1"/><line x1="9" y1="19" x2="15" y2="19"/><line x1="12" y1="16" x2="12" y2="22"/></svg>
                </Btn>
                <Btn tooltip="Delete column" onClick={() => editor.chain().focus().deleteColumn().run()}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="3" width="12" height="18" rx="1"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
                </Btn>
                <Btn tooltip="Delete row" onClick={() => editor.chain().focus().deleteRow().run()}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="6" width="18" height="12" rx="1"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
                </Btn>
                <Btn tooltip="Delete table" onClick={() => editor.chain().focus().deleteTable().run()}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                </Btn>
              </>
            )}

            {/* Insert Media (combined dropdown) — shown if any media feature is enabled */}
            <div style={{ position: "relative" }} ref={mediaDropdownRef}>
              <Btn tooltip={uploading ? "Uploading…" : "Insert media"} disabled={uploading}
                onClick={() => { setShowMediaDropdown((o) => !o); setMediaSubMenu(null); }}>
                <LucideImage className="w-[18px] h-[18px]" />
              </Btn>
              {showMediaDropdown && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, zIndex: 50,
                  marginTop: "4px", minWidth: "180px",
                  background: "var(--popover)", border: "1px solid var(--border)",
                  borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                  overflow: "hidden",
                }}>
                  {mediaSubMenu === null && (<>
                    {/* Image — has sub-options */}
                    <button type="button" style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      width: "100%", padding: "0.5rem 0.75rem", border: "none",
                      background: "transparent", color: "var(--foreground)",
                      fontSize: "0.8rem", cursor: "pointer", textAlign: "left",
                    }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.07)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
                      onClick={() => setMediaSubMenu("image")}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><IconImage />Image</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                    {/* Video */}
                    <button type="button" style={{
                      display: "flex", alignItems: "center", gap: "0.5rem",
                      width: "100%", padding: "0.5rem 0.75rem", border: "none",
                      background: "transparent", color: "var(--foreground)",
                      fontSize: "0.8rem", cursor: "pointer", textAlign: "left",
                    }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.07)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
                      onClick={() => { setShowMediaDropdown(false); setShowVideoDialog(true); setVideoUrl(""); }}
                    >
                      <IconVideo />Video
                    </button>
                    {/* Audio — has sub-options */}
                    <button type="button" style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      width: "100%", padding: "0.5rem 0.75rem", border: "none",
                      background: "transparent", color: "var(--foreground)",
                      fontSize: "0.8rem", cursor: "pointer", textAlign: "left",
                    }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.07)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
                      onClick={() => setMediaSubMenu("audio")}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><IconAudio />Audio</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                    {/* File attachment */}
                    <button type="button" style={{
                      display: "flex", alignItems: "center", gap: "0.5rem",
                      width: "100%", padding: "0.5rem 0.75rem", border: "none",
                      background: "transparent", color: "var(--foreground)",
                      fontSize: "0.8rem", cursor: "pointer", textAlign: "left",
                    }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.07)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
                      onClick={() => {
                        setShowMediaDropdown(false);
                        editor.chain().focus().insertContent({ type: "fileAttachment", attrs: { src: "", filename: "", size: "" } }).run();
                      }}
                    >
                      <IconAttachment />File attachment
                    </button>
                    {/* Map embed */}
                    <button type="button" style={{
                      display: "flex", alignItems: "center", gap: "0.5rem",
                      width: "100%", padding: "0.5rem 0.75rem", border: "none",
                      background: "transparent", color: "var(--foreground)",
                      fontSize: "0.8rem", cursor: "pointer", textAlign: "left",
                    }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.07)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
                      onClick={() => setMediaSubMenu("map")}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                        Map
                      </span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  </>)}

                  {/* Image sub-menu */}
                  {mediaSubMenu === "image" && (<>
                    <button type="button" style={{
                      display: "flex", alignItems: "center", gap: "0.5rem",
                      width: "100%", padding: "0.4rem 0.75rem", border: "none",
                      background: "transparent", color: "var(--muted-foreground)",
                      fontSize: "0.7rem", cursor: "pointer", textAlign: "left",
                    }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.07)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
                      onClick={() => setMediaSubMenu(null)}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                      Image
                    </button>
                    <div style={{ height: "1px", background: "var(--border)", margin: "2px 0" }} />
                    <button type="button" style={{
                      display: "flex", alignItems: "center", gap: "0.5rem",
                      width: "100%", padding: "0.5rem 0.75rem", border: "none",
                      background: "transparent", color: "var(--foreground)",
                      fontSize: "0.8rem", cursor: "pointer", textAlign: "left",
                    }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.07)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
                      onClick={() => { setShowMediaDropdown(false); setMediaSubMenu(null); imageInputRef.current?.click(); }}
                    >
                      Upload file
                    </button>
                    <button type="button" style={{
                      display: "flex", alignItems: "center", gap: "0.5rem",
                      width: "100%", padding: "0.5rem 0.75rem", border: "none",
                      background: "transparent", color: "var(--foreground)",
                      fontSize: "0.8rem", cursor: "pointer", textAlign: "left",
                    }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.07)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
                      onClick={() => { setShowMediaDropdown(false); setMediaSubMenu(null); openImageMediaBrowser(); }}
                    >
                      Browse Media
                    </button>
                  </>)}

                  {/* Audio sub-menu */}
                  {mediaSubMenu === "audio" && (<>
                    <button type="button" style={{
                      display: "flex", alignItems: "center", gap: "0.5rem",
                      width: "100%", padding: "0.4rem 0.75rem", border: "none",
                      background: "transparent", color: "var(--muted-foreground)",
                      fontSize: "0.7rem", cursor: "pointer", textAlign: "left",
                    }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.07)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
                      onClick={() => setMediaSubMenu(null)}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                      Audio
                    </button>
                    <div style={{ height: "1px", background: "var(--border)", margin: "2px 0" }} />
                    <button type="button" style={{
                      display: "flex", alignItems: "center", gap: "0.5rem",
                      width: "100%", padding: "0.5rem 0.75rem", border: "none",
                      background: "transparent", color: "var(--foreground)",
                      fontSize: "0.8rem", cursor: "pointer", textAlign: "left",
                    }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.07)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
                      onClick={() => { setShowMediaDropdown(false); setMediaSubMenu(null); audioInputRef.current?.click(); }}
                    >
                      Upload file
                    </button>
                    <button type="button" style={{
                      display: "flex", alignItems: "center", gap: "0.5rem",
                      width: "100%", padding: "0.5rem 0.75rem", border: "none",
                      background: "transparent", color: "var(--foreground)",
                      fontSize: "0.8rem", cursor: "pointer", textAlign: "left",
                    }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.07)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
                      onClick={() => { setShowMediaDropdown(false); setMediaSubMenu(null); openAudioMediaBrowser(); }}
                    >
                      Browse Media
                    </button>
                  </>)}

                  {/* Map sub-menu */}
                  {mediaSubMenu === "map" && (<>
                    <button type="button" style={{
                      display: "flex", alignItems: "center", gap: "0.5rem",
                      width: "100%", padding: "0.4rem 0.75rem", border: "none",
                      background: "transparent", color: "var(--muted-foreground)",
                      fontSize: "0.7rem", cursor: "pointer", textAlign: "left",
                    }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.07)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
                      onClick={() => setMediaSubMenu(null)}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                      Map
                    </button>
                    <div style={{ height: "1px", background: "var(--border)", margin: "2px 0" }} />
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const input = (e.currentTarget.elements.namedItem("mapAddress") as HTMLInputElement);
                        const addr = input?.value.trim();
                        if (addr) {
                          setShowMediaDropdown(false);
                          setMediaSubMenu(null);
                          editor.chain().focus().insertContent({ type: "mapEmbed", attrs: { address: addr, zoom: "14" } }).run();
                        }
                      }}
                      style={{ padding: "0.375rem 0.75rem", display: "flex", gap: "0.25rem" }}
                    >
                      <input
                        name="mapAddress"
                        type="text"
                        placeholder="Address or place..."
                        autoFocus
                        style={{
                          flex: 1, padding: "0.3rem 0.5rem", fontSize: "0.75rem", borderRadius: "4px",
                          border: "1px solid var(--border)", background: "var(--background)",
                          color: "var(--foreground)", outline: "none",
                        }}
                      />
                      <button type="submit" style={{
                        padding: "0.3rem 0.5rem", borderRadius: "4px", border: "none",
                        background: "#F7BB2E", color: "#0D0D0D", fontSize: "0.7rem",
                        fontWeight: 600, cursor: "pointer",
                      }}>
                        Insert
                      </button>
                    </form>
                  </>)}
                </div>
              )}
            </div>
            {/* Hidden file inputs for image and audio upload */}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = ""; }}
            />
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  editor.chain().focus().insertContent({ type: "audioEmbed", attrs: { src: "", title: f.name } }).run();
                  (async () => {
                    const fd = new FormData();
                    fd.append("file", f);
                    fd.append("folder", "audio");
                    const res = await fetch("/api/upload", { method: "POST", body: fd });
                    const { url } = await res.json();
                    const { state } = editor;
                    state.doc.descendants((node, pos) => {
                      if (node.type.name === "audioEmbed" && !node.attrs.src && node.attrs.title === f.name) {
                        editor.chain().command(({ tr }) => {
                          tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: url });
                          return true;
                        }).run();
                        return false;
                      }
                    });
                  })();
                }
                e.target.value = "";
              }}
            />

            {/* Insert Block */}
            <Btn tooltip="Insert content block" onClick={openBlockPicker}>
              <IconBlocks />
            </Btn>

            {/* Insert Callout */}
            {has("callout") && <Btn tooltip="Insert callout" onClick={() => {
              editor.chain().focus().insertContent({
                type: "callout",
                attrs: { variant: "info" },
                content: [{ type: "paragraph", content: [{ type: "text", text: "Type your note here…" }] }],
              }).run();
            }}>
              <MessageSquareWarning className="w-[18px] h-[18px]" />
            </Btn>}

            {/* Insert Interactive (separate from media — Zap icon, same as sidebar) */}
            {has("interactive") && <Btn tooltip="Insert interactive" onClick={() => {
              setShowInteractivePicker(true);
              setIntSearch("");
              setInteractivesLoading(true);
              fetch("/api/interactives")
                .then(r => r.json())
                .then((data) => {
                  const items = Array.isArray(data) ? data : (data.interactives ?? []);
                  setAvailableInteractives(items
                    .filter((i: Record<string, string>) => i.status !== "trashed")
                    .map((i: Record<string, string>) => ({ id: i.id, title: i.name || i.title || i.id })));
                })
                .catch(() => setAvailableInteractives([]))
                .finally(() => setInteractivesLoading(false));
            }}>
              <Zap className="w-[18px] h-[18px]" />
            </Btn>}

            {/* Spacer to push right-side controls to the right */}
            <div style={{ flex: 1 }} />

            {/* Zoom */}
            <div style={{ display: "flex", alignItems: "center", gap: "2px", marginRight: "0.25rem" }}>
              <button type="button" title="Zoom out"
                onMouseDown={(e) => { e.preventDefault(); setZoom(z => Math.max(50, z - 10)); }}
                disabled={zoom <= 50}
                style={{ width: 24, height: 24, borderRadius: 4, border: "none", background: "transparent", cursor: zoom <= 50 ? "not-allowed" : "pointer", color: "var(--muted-foreground)", display: "flex", alignItems: "center", justifyContent: "center", opacity: zoom <= 50 ? 0.3 : 1 }}>
                <IconZoomOut />
              </button>
              <button type="button" title="Reset zoom"
                onMouseDown={(e) => { e.preventDefault(); setZoom(100); }}
                style={{ fontSize: "0.65rem", fontFamily: "monospace", color: zoom === 100 ? "var(--muted-foreground)" : "var(--foreground)", background: "transparent", border: "none", cursor: "pointer", padding: "0 2px", minWidth: "2rem", textAlign: "center" }}>
                {zoom}%
              </button>
              <button type="button" title="Zoom in"
                onMouseDown={(e) => { e.preventDefault(); setZoom(z => Math.min(200, z + 10)); }}
                disabled={zoom >= 200}
                style={{ width: 24, height: 24, borderRadius: 4, border: "none", background: "transparent", cursor: zoom >= 200 ? "not-allowed" : "pointer", color: "var(--muted-foreground)", display: "flex", alignItems: "center", justifyContent: "center", opacity: zoom >= 200 ? 0.3 : 1 }}>
                <IconZoomIn />
              </button>
            </div>

            <Sep />

            {/* Proofread */}
            <Btn tooltip="Proofread" onClick={async () => {
              if (!editor) return;
              const text = editor.getText();
              if (!text.trim()) return;
              const toastId = toast.loading("Proofreading...");
              try {
                const res = await fetch("/api/cms/ai/proofread", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ text }),
                });
                const data = await res.json();
                if (!res.ok) { toast.error(data.error ?? "Proofread failed", { id: toastId }); return; }
                const corrections = data.corrections ?? [];
                if (corrections.length === 0) {
                  toast.success(`No errors found (${data.language})`, { id: toastId });
                } else {
                  toast.success(`${corrections.length} issue${corrections.length > 1 ? "s" : ""} found (${data.language})`, { id: toastId, duration: 8000,
                    description: corrections.map((c: { original: string; suggestion: string; reason: string; type: string }) =>
                      `${c.type}: "${c.original}" → "${c.suggestion}" — ${c.reason}`
                    ).join("\n"),
                  });
                }
              } catch { toast.error("Proofread failed", { id: toastId }); }
            }}>
              <IconProofread />
            </Btn>

            {/* Source toggle */}
            <Btn tooltip={showSource ? "Visual editor" : "View source"} active={showSource}
              onClick={() => {
                if (!showSource) {
                  // Switch to source: grab current markdown
                  setSourceText((editor.storage as any).markdown.getMarkdown());
                  setShowSource(true);
                } else {
                  // Switch back to visual: defer setContent to avoid flushSync during render
                  setShowSource(false);
                  queueMicrotask(() => {
                    editor.commands.setContent(sourceText);
                    onChange((editor.storage as any).markdown.getMarkdown());
                  });
                }
              }}>
              <IconCode />
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
            position: "sticky", top: stickyOffset + 49, zIndex: 19,
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
            {toolbarState.imageSrc && toolbarState.imageSrc.includes("/uploads/") && (
              <>
                <CtxSep />
                <AIMetadataPopover
                  imageUrl={toolbarState.imageSrc}
                  variant="ctx"
                  currentAlt={toolbarState.imageAlt}
                  docLocale={document.querySelector<HTMLElement>("[data-doc-locale]")?.dataset.docLocale}
                  onApplyAlt={(alt) => {
                    editor.chain().focus().updateAttributes("image", { alt }).run();
                    onChange((editor.storage as any).markdown.getMarkdown());
                  }}
                />
              </>
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
            position: "sticky", top: stickyOffset + 49, zIndex: 19,
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
            <CtxSep />
            <CtxBtn title="Reset width to full" active={false}
              onClick={() => editor.chain().focus().updateAttributes("videoEmbed", { width: null }).run()}>
              <IconMaximize />
            </CtxBtn>
          </div>
        )}

        {/* ── Context toolbar — audio controls ── */}
        {!disabled && editor && toolbarState?.isAudio && (
          <div style={{
            display: "flex", alignItems: "center", gap: "2px",
            padding: "0.25rem 0.75rem",
            borderBottom: "1px solid var(--border)",
            backgroundColor: "var(--background)",
            position: "sticky", top: stickyOffset + 49, zIndex: 19,
          }}>
            <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginRight: "0.25rem", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>Audio</span>
            <CtxSep />
            <CtxBtn title="Align left"   active={toolbarState.audioAlign === "left"}
              onClick={() => editor.chain().focus().updateAttributes("audioEmbed", { align: "left" }).run()}>
              <IconAlignLeft />
            </CtxBtn>
            <CtxBtn title="Center" active={toolbarState.audioAlign === "center"}
              onClick={() => editor.chain().focus().updateAttributes("audioEmbed", { align: "center" }).run()}>
              <IconAlignCenter />
            </CtxBtn>
            <CtxBtn title="Align right"  active={toolbarState.audioAlign === "right"}
              onClick={() => editor.chain().focus().updateAttributes("audioEmbed", { align: "right" }).run()}>
              <IconAlignRight />
            </CtxBtn>
          </div>
        )}

        {/* ── Context toolbar — interactive controls (same pattern as Image) ── */}
        {!disabled && editor && toolbarState?.isInteractive && (
          <div style={{
            display: "flex", alignItems: "center", gap: "2px",
            padding: "0.25rem 0.75rem",
            borderBottom: "1px solid var(--border)",
            backgroundColor: "var(--background)",
            position: "sticky", top: stickyOffset + 49, zIndex: 19,
          }}>
            <span style={{ fontSize: "0.7rem", color: "#F7BB2E", marginRight: "0.25rem", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>Interactive</span>
            <CtxSep />
            <CtxBtn title="Float left" active={toolbarState.interactiveAlign === "left"}
              onClick={() => editor.chain().focus().updateAttributes("interactiveEmbed", { align: "left" }).run()}>
              <IconAlignLeft />
            </CtxBtn>
            <CtxBtn title="Center (full width)" active={toolbarState.interactiveAlign === "center" || toolbarState.interactiveAlign === ""}
              onClick={() => editor.chain().focus().updateAttributes("interactiveEmbed", { align: "center", width: null }).run()}>
              <IconAlignCenter />
            </CtxBtn>
            <CtxBtn title="Float right" active={toolbarState.interactiveAlign === "right"}
              onClick={() => editor.chain().focus().updateAttributes("interactiveEmbed", { align: "right" }).run()}>
              <IconAlignRight />
            </CtxBtn>
            <CtxSep />
            <CtxBtn title="Reset width to full" active={false}
              onClick={() => editor.chain().focus().updateAttributes("interactiveEmbed", { width: null }).run()}>
              <IconMaximize />
            </CtxBtn>
          </div>
        )}

        {/* ── Context toolbar — callout controls ── */}
        {!disabled && editor && toolbarState?.isCallout && (
          <div style={{
            display: "flex", alignItems: "center", gap: "2px",
            padding: "0.25rem 0.75rem",
            borderBottom: "1px solid var(--border)",
            backgroundColor: "var(--background)",
            position: "sticky", top: stickyOffset + 49, zIndex: 19,
          }}>
            <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginRight: "0.25rem", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>Callout</span>
            <CtxSep />
            <CtxBtn title="Info" active={toolbarState.calloutVariant === "info"}
              onClick={() => editor.chain().focus().updateAttributes("callout", { variant: "info" }).run()}>
              <span style={{ fontSize: "0.7rem", fontWeight: 600 }}>Info</span>
            </CtxBtn>
            <CtxBtn title="Warning" active={toolbarState.calloutVariant === "warning"}
              onClick={() => editor.chain().focus().updateAttributes("callout", { variant: "warning" }).run()}>
              <span style={{ fontSize: "0.7rem", fontWeight: 600 }}>Warn</span>
            </CtxBtn>
            <CtxBtn title="Tip" active={toolbarState.calloutVariant === "tip"}
              onClick={() => editor.chain().focus().updateAttributes("callout", { variant: "tip" }).run()}>
              <span style={{ fontSize: "0.7rem", fontWeight: 600 }}>Tip</span>
            </CtxBtn>
          </div>
        )}

        {/* ── Body ── */}
        {showSource ? (
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            spellCheck={false}
            style={{
              width: "100%",
              minHeight: "300px",
              padding: "1rem",
              fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
              fontSize: "0.8rem",
              lineHeight: "1.6",
              color: "var(--foreground)",
              backgroundColor: "var(--background)",
              border: "none",
              outline: "none",
              resize: "vertical",
              tabSize: 2,
            }}
          />
        ) : (
          <div className="rte-body" style={zoom !== 100 ? { fontSize: `${zoom}%` } : undefined}>
            <EditorContent editor={editor} />
            {editor && <AIBubbleMenu editor={editor} />}
          </div>
        )}
      </div>

      {/* ── Interactive Picker dialog ── */}
      {showInteractivePicker && (() => {
        const filtered = intSearch.trim()
          ? availableInteractives.filter(i =>
              i.title.toLowerCase().includes(intSearch.toLowerCase()) ||
              i.id.toLowerCase().includes(intSearch.toLowerCase())
            )
          : availableInteractives;
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)" }}
            onMouseDown={() => setShowInteractivePicker(false)}>
            <div onMouseDown={(e) => e.stopPropagation()} style={{
              width: "100%", maxWidth: "480px", maxHeight: "70vh",
              backgroundColor: "var(--card)", border: "1px solid var(--border)",
              borderRadius: "1rem", boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
              display: "flex", flexDirection: "column", overflow: "hidden",
            }}>
              {/* Header */}
              <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--foreground)" }}>Insert Interactive</span>
                <button type="button" onClick={() => setShowInteractivePicker(false)}
                  style={{ width: "24px", height: "24px", borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", color: "var(--muted-foreground)", fontSize: "1.1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
              </div>
              {/* Search */}
              <div style={{ padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
                <input
                  type="text"
                  value={intSearch}
                  onChange={(e) => setIntSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setShowInteractivePicker(false); } }}
                  placeholder="Search interactives…"
                  autoFocus
                  style={{
                    width: "100%", padding: "0.4rem 0.625rem", borderRadius: "6px",
                    border: "1px solid var(--border)", background: "var(--background)",
                    color: "var(--foreground)", fontSize: "0.85rem", outline: "none",
                  }}
                />
              </div>
              {/* List */}
              <div style={{ flex: 1, overflow: "auto", padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {interactivesLoading && (
                  <p style={{ fontSize: "0.875rem", color: "var(--muted-foreground)", padding: "1rem 0", textAlign: "center" }}>Loading…</p>
                )}
                {!interactivesLoading && filtered.length === 0 && (
                  <p style={{ fontSize: "0.875rem", color: "var(--muted-foreground)", padding: "1rem 0", textAlign: "center" }}>
                    {intSearch ? `No interactives matching "${intSearch}"` : "No interactives found. Create one in the Interactives Manager first."}
                  </p>
                )}
                {filtered.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      editor?.chain().focus().insertContent({ type: "interactiveEmbed", attrs: { interactiveId: item.id, title: item.title } }).run();
                      setShowInteractivePicker(false);
                      setIntSearch("");
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1rem",
                      borderRadius: "0.625rem", border: "1px solid var(--border)", backgroundColor: "transparent",
                      cursor: "pointer", textAlign: "left", transition: "border-color 120ms, background 120ms",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.05)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#F7BB2E"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
                  >
                    <span style={{ fontSize: "1.25rem", flexShrink: 0, color: "#F7BB2E" }}>⚡</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--foreground)", margin: 0 }}>{item.title}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Video URL dialog ── */}
      {showVideoDialog && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)" }}
          onMouseDown={() => setShowVideoDialog(false)}>
          <div onMouseDown={(e) => e.stopPropagation()} style={{
            width: "100%", maxWidth: "420px",
            backgroundColor: "var(--card)", border: "1px solid var(--border)",
            borderRadius: "1rem", boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
            display: "flex", flexDirection: "column", gap: "0.875rem", padding: "1.5rem",
          }}>
            <span style={{ fontSize: "0.95rem", fontWeight: 600 }}>Insert Video</span>
            <input
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setShowVideoDialog(false);
                if (e.key === "Enter" && videoUrl.trim()) {
                  editor?.chain().focus().insertContent({ type: "videoEmbed", attrs: { url: videoUrl.trim() } }).run();
                  setShowVideoDialog(false);
                }
              }}
              placeholder="YouTube or Vimeo URL"
              autoFocus
              style={{
                width: "100%", padding: "0.5rem 0.75rem", borderRadius: "8px",
                border: "1px solid var(--border)", background: "var(--background)",
                color: "var(--foreground)", fontSize: "0.875rem", outline: "none",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button type="button" onClick={() => setShowVideoDialog(false)}
                style={{ padding: "0.4rem 0.875rem", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", fontSize: "0.8rem", cursor: "pointer" }}>
                Cancel
              </button>
              <button type="button" disabled={!videoUrl.trim()} onClick={() => {
                editor?.chain().focus().insertContent({ type: "videoEmbed", attrs: { url: videoUrl.trim() } }).run();
                setShowVideoDialog(false);
              }}
                style={{ padding: "0.4rem 0.875rem", borderRadius: "6px", border: "none", background: videoUrl.trim() ? "var(--primary)" : "var(--muted)", color: videoUrl.trim() ? "var(--primary-foreground)" : "var(--muted-foreground)", fontSize: "0.8rem", cursor: videoUrl.trim() ? "pointer" : "not-allowed" }}>
                Insert
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* ── Image Media Browser ── */}
      {showImageMediaBrowser && (() => {
        const filtered = mediaBrowserItems.filter((item) => {
          if (!mediaBrowserSearch) return true;
          const q = mediaBrowserSearch.toLowerCase();
          const qNoExt = q.replace(/\.[^.]+$/, "");
          if (item.name.toLowerCase().includes(q) || item.name.toLowerCase().includes(qNoExt)) return true;
          // Search AI metadata (caption, alt, tags)
          const ai = mediaBrowserAiMeta[item.name];
          if (ai) {
            if (ai.caption?.toLowerCase().includes(q)) return true;
            if (ai.alt?.toLowerCase().includes(q)) return true;
            if (ai.tags?.some((t) => t.toLowerCase().includes(q))) return true;
          }
          return false;
        });
        return (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)" }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) setShowImageMediaBrowser(false); }}
          >
            <div onMouseDown={(e) => e.stopPropagation()} style={{
              width: "min(640px, 90vw)", height: "70vh",
              backgroundColor: "var(--card)", border: "1px solid var(--border)",
              borderRadius: "1rem", boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
              display: "flex", flexDirection: "column", overflow: "hidden",
            }}>
              <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 500, fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <IconImage /> Select Image
                </span>
                <button type="button" onClick={() => setShowImageMediaBrowser(false)}
                  style={{ width: "24px", height: "24px", borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", color: "var(--muted-foreground)", fontSize: "1.1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>&times;</button>
              </div>
              <div style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
                <input
                  type="text"
                  value={mediaBrowserSearch}
                  onChange={(e) => { setMediaBrowserSearch(e.target.value); setMediaBrowserPage(1); }}
                  placeholder="Search images..."
                  autoFocus
                  style={{
                    width: "100%", padding: "0.35rem 0.5rem", borderRadius: "6px",
                    border: "1px solid var(--border)", background: "var(--background)",
                    color: "var(--foreground)", fontSize: "0.8rem", outline: "none",
                  }}
                />
              </div>
              <div style={{ overflowY: "auto", padding: "0.75rem" }}>
                {mediaBrowserLoading && (
                  <div style={{ padding: "2rem", textAlign: "center", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>Loading media...</div>
                )}
                {!mediaBrowserLoading && mediaBrowserItems.length === 0 && (
                  <div style={{ padding: "2rem", textAlign: "center", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>No images found in Media library</div>
                )}
                {!mediaBrowserLoading && mediaBrowserItems.length > 0 && (() => {
                  if (filtered.length === 0) return (
                    <div style={{ padding: "2rem", textAlign: "center", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
                      No images match &ldquo;{mediaBrowserSearch}&rdquo;
                    </div>
                  );
                  const PAGE_SIZE = 50;
                  const visible = filtered.slice(0, mediaBrowserPage * PAGE_SIZE);
                  const hasMore = visible.length < filtered.length;
                  return (
                    <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: "0.5rem" }}>
                      {visible.map((item) => (
                        <button
                          key={item.url}
                          type="button"
                          onClick={() => {
                            // Store relative path — portable across environments
                            let storedUrl = item.url;
                            try { const u = new URL(item.url); storedUrl = u.pathname; } catch { /* already relative */ }
                            editor?.chain().focus().setImage({ src: storedUrl, alt: item.name }).run();
                            tryAutoFillAlt(storedUrl);
                            setShowImageMediaBrowser(false);
                          }}
                          style={{
                            background: "none", border: "1px solid var(--border)",
                            borderRadius: "6px", cursor: "pointer", padding: "0.25rem",
                            display: "flex", flexDirection: "column", alignItems: "center",
                            gap: "0.25rem", overflow: "hidden",
                          }}
                          className="hover:border-primary transition-colors"
                          title={item.name}
                        >
                          <img src={item.url} alt={item.name} loading="lazy"
                            style={{ width: "100%", height: "80px", objectFit: "cover", borderRadius: "4px" }} />
                          <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%", textAlign: "center" }}>
                            {item.name}
                          </span>
                        </button>
                      ))}
                    </div>
                    {hasMore && (
                      <button type="button" onClick={() => setMediaBrowserPage((p) => p + 1)}
                        style={{ display: "block", margin: "0.75rem auto 0", padding: "0.4rem 1.25rem", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.75rem", cursor: "pointer" }}>
                        Show more ({filtered.length - visible.length} remaining)
                      </button>
                    )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Audio Media Browser ── */}
      {showAudioMediaBrowser && (() => {
        const filtered = mediaBrowserItems.filter((item) => {
          if (!mediaBrowserSearch) return true;
          const q = mediaBrowserSearch.toLowerCase();
          const qNoExt = q.replace(/\.[^.]+$/, "");
          return item.name.toLowerCase().includes(q) || item.name.toLowerCase().includes(qNoExt);
        }
        );
        return (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)" }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) setShowAudioMediaBrowser(false); }}
          >
            <div onMouseDown={(e) => e.stopPropagation()} style={{
              width: "min(640px, 90vw)", maxHeight: "70vh",
              backgroundColor: "var(--card)", border: "1px solid var(--border)",
              borderRadius: "1rem", boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
              display: "flex", flexDirection: "column", overflow: "hidden",
            }}>
              <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 500, fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <IconAudio /> Select Audio
                </span>
                <button type="button" onClick={() => setShowAudioMediaBrowser(false)}
                  style={{ width: "24px", height: "24px", borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", color: "var(--muted-foreground)", fontSize: "1.1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>&times;</button>
              </div>
              <div style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
                <input
                  type="text"
                  value={mediaBrowserSearch}
                  onChange={(e) => setMediaBrowserSearch(e.target.value)}
                  placeholder="Search audio files..."
                  autoFocus
                  style={{
                    width: "100%", padding: "0.35rem 0.5rem", borderRadius: "6px",
                    border: "1px solid var(--border)", background: "var(--background)",
                    color: "var(--foreground)", fontSize: "0.8rem", outline: "none",
                  }}
                />
              </div>
              <div style={{ overflowY: "auto", padding: "0.75rem" }}>
                {mediaBrowserLoading && (
                  <div style={{ padding: "2rem", textAlign: "center", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>Loading media...</div>
                )}
                {!mediaBrowserLoading && mediaBrowserItems.length === 0 && (
                  <div style={{ padding: "2rem", textAlign: "center", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>No audio files found in Media library</div>
                )}
                {!mediaBrowserLoading && mediaBrowserItems.length > 0 && (() => {
                  if (filtered.length === 0) return (
                    <div style={{ padding: "2rem", textAlign: "center", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
                      No audio files match &ldquo;{mediaBrowserSearch}&rdquo;
                    </div>
                  );
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                      {filtered.map((item) => (
                        <button
                          key={item.url}
                          type="button"
                          onClick={() => {
                            let storedUrl = item.url;
                            try { const u = new URL(item.url); storedUrl = u.pathname; } catch { /* already relative */ }
                            editor?.chain().focus().insertContent({ type: "audioEmbed", attrs: { src: storedUrl, title: item.name } }).run();
                            setShowAudioMediaBrowser(false);
                          }}
                          style={{
                            display: "flex", alignItems: "center", gap: "0.75rem",
                            padding: "0.5rem 0.75rem", border: "1px solid var(--border)",
                            borderRadius: "8px", background: "transparent",
                            cursor: "pointer", textAlign: "left",
                            transition: "border-color 120ms, background 120ms",
                          }}
                          className="hover:border-primary transition-colors"
                          title={item.name}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.05)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
                        >
                          <span style={{ fontSize: "1.25rem", flexShrink: 0, color: "var(--muted-foreground)" }}><IconAudio /></span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--foreground)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</p>
                            {item.size > 0 && (
                              <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: 0 }}>{formatFileSize(item.size)}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })()}
    </TooltipProvider>
  );
}

// Wrap in memo — only re-render when value or disabled actually changes.
// This prevents TipTap/ProseMirror DOM conflicts when unrelated parent state
// (e.g. _fieldMeta AI lock toggle) causes a re-render.
export const RichTextEditor = memo(RichTextEditorInner, (prev, next) =>
  prev.value === next.value && prev.disabled === next.disabled
);
