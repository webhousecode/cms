"use client";

import type { FieldConfig, BlockConfig } from "@webhouse/cms";
import { FieldEditor } from "./field-editor";
import { ColumnsEditor } from "./columns-editor";
import { ChevronDown, ChevronRight, ArrowUp, ArrowDown, Plus, Copy } from "lucide-react";
import { useState, useRef } from "react";

interface Props {
  field: FieldConfig;
  value: Record<string, unknown>[];
  onChange: (value: Record<string, unknown>[]) => void;
  locked?: boolean;
  blocksConfig?: BlockConfig[];
  /** Controlled expanded state — if provided, component uses this instead of internal state */
  expandedState?: Record<number, boolean>;
  onExpandedChange?: (expanded: Record<number, boolean>) => void;
}

function getBlockLabel(block: Record<string, unknown>, config: BlockConfig | undefined): string {
  if (!config) return String(block._block ?? "Unknown");
  // Use first text/textarea/richtext field value if available
  for (const f of config.fields) {
    if ((f.type === "text" || f.type === "textarea" || f.type === "richtext") && block[f.name]) {
      const raw = String(block[f.name]);
      // Strip markdown syntax for a clean preview
      const clean = raw.replace(/[#*_`>\[\]!]/g, "").replace(/\n+/g, " ").trim();
      if (!clean) continue;
      return clean.length > 80 ? clean.slice(0, 80) + "…" : clean;
    }
  }
  return config.label ?? config.name;
}

export function BlocksEditor({ field, value, onChange, locked, blocksConfig = [], expandedState, onExpandedChange }: Props) {
  const blocks = Array.isArray(value) ? value : [];
  const baseNames = field.blocks ?? blocksConfig.map((b) => b.name);
  // Add builtin blocks that exist in blocksConfig but aren't already in baseNames
  const builtinNames = ["columns", "video", "audio", "file", "interactive"];
  const configNames = blocksConfig.map((b) => b.name);
  const allowedBlockNames = [
    ...new Set([...baseNames,
    ...builtinNames.filter((n) => !baseNames.includes(n) && configNames.includes(n)),
  ])];
  const storageKey = `cms-blocks-expanded:${field.name}`;
  const controlled = expandedState !== undefined;
  const [internalExpanded, setInternalExpanded] = useState<Record<number, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });
  const expanded = controlled ? expandedState : internalExpanded;
  const [showPicker, setShowPicker] = useState(false);
  const [confirmRemoveIdx, setConfirmRemoveIdx] = useState<number | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setExpandedPersist(updater: (prev: Record<number, boolean>) => Record<number, boolean>) {
    if (controlled) {
      const next = updater(expandedState);
      onExpandedChange?.(next);
    } else {
      setInternalExpanded((prev) => {
        const next = updater(prev);
        try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
        return next;
      });
    }
  }

  function toggle(i: number) {
    setExpandedPersist((prev) => ({ ...prev, [i]: !prev[i] }));
  }

  function getConfig(blockType: string): BlockConfig | undefined {
    return blocksConfig.find((b) => b.name === blockType);
  }

  function updateBlockField(index: number, fieldName: string, val: unknown) {
    const next = blocks.map((block, i) =>
      i === index ? { ...block, [fieldName]: val } : block
    );
    onChange(next);
  }

  const [flashIdx, setFlashIdx] = useState<number | null>(null);

  function removeBlock(index: number) {
    onChange(blocks.filter((_, i) => i !== index));
  }

  const flashRef = useRef<HTMLDivElement>(null);

  function cloneBlock(index: number) {
    const clone = JSON.parse(JSON.stringify(blocks[index]));
    const newIndex = blocks.length;
    setExpandedPersist((prev) => ({ ...prev, [newIndex]: true }));
    onChange([...blocks, clone]);
    setFlashIdx(newIndex);
    setTimeout(() => setFlashIdx(null), 2000);
    // Scroll into view after React renders
    requestAnimationFrame(() => {
      setTimeout(() => {
        flashRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    });
  }

  function moveBlock(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    setExpandedPersist((prev) => {
      const updated = { ...prev };
      const a = prev[index];
      const b = prev[target];
      updated[index] = b;
      updated[target] = a;
      return updated;
    });
    onChange(next);
  }

  function addBlock(blockName: string) {
    const config = getConfig(blockName);
    const empty: Record<string, unknown> = { _block: blockName };
    if (blockName === "columns") {
      // Initialize columns block with default layout and 2 empty columns
      empty.layout = "1-1";
      empty.columns = [[], []];
    } else if (config) {
      for (const f of config.fields) {
        if (f.type === "boolean") empty[f.name] = false;
        else if (f.type === "array" || f.type === "blocks") empty[f.name] = [];
        else if (f.type === "object") empty[f.name] = {};
        else empty[f.name] = f.defaultValue ?? "";
      }
    }
    const newIndex = blocks.length;
    setExpandedPersist((prev) => ({ ...prev, [newIndex]: true }));
    onChange([...blocks, empty]);
    setShowPicker(false);
    setFlashIdx(newIndex);
    setTimeout(() => setFlashIdx(null), 2000);
    requestAnimationFrame(() => {
      setTimeout(() => {
        flashRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    });
  }

  const allOpen = blocks.length > 0 && blocks.every((_, i) => expanded[i]);
  const allClosed = blocks.length > 0 && blocks.every((_, i) => !expanded[i]);

  function toggleAll(open: boolean) {
    const next: Record<number, boolean> = {};
    blocks.forEach((_, i) => { next[i] = open; });
    setExpandedPersist(() => next);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {blocks.length >= 2 && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.25rem" }}>
          <button
            type="button"
            onClick={() => toggleAll(true)}
            disabled={allOpen}
            style={{
              background: "none", border: "none", cursor: allOpen ? "default" : "pointer",
              fontSize: "0.6rem", color: allOpen ? "var(--muted-foreground)/40" : "var(--muted-foreground)",
              opacity: allOpen ? 0.4 : 1, padding: "0.1rem 0.3rem",
            }}
            className={allOpen ? "" : "hover:text-foreground transition-colors"}
          >
            Open all
          </button>
          <span style={{ fontSize: "0.6rem", color: "var(--muted-foreground)", opacity: 0.3 }}>|</span>
          <button
            type="button"
            onClick={() => toggleAll(false)}
            disabled={allClosed}
            style={{
              background: "none", border: "none", cursor: allClosed ? "default" : "pointer",
              fontSize: "0.6rem", color: allClosed ? "var(--muted-foreground)/40" : "var(--muted-foreground)",
              opacity: allClosed ? 0.4 : 1, padding: "0.1rem 0.3rem",
            }}
            className={allClosed ? "" : "hover:text-foreground transition-colors"}
          >
            Close all
          </button>
        </div>
      )}
      {blocks.length === 0 && (
        <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--muted-foreground)", fontSize: "0.85rem", border: "1px dashed var(--border)", borderRadius: "8px" }}>
          No sections added
        </div>
      )}
      {blocks.map((block, i) => {
        const blockType = String(block._block ?? "");
        const config = getConfig(blockType);
        const isOpen = expanded[i] ?? false;
        const fields = config?.fields ?? [];

        return (
          <div
            key={i}
            ref={flashIdx === i ? flashRef : undefined}
            style={{
              border: flashIdx === i ? "1px solid var(--primary)" : "1px solid var(--border)",
              borderRadius: "8px",
              background: "var(--card)",
              transition: "border-color 600ms, box-shadow 600ms",
              boxShadow: flashIdx === i ? "0 0 20px rgba(247, 187, 46, 0.5), inset 0 0 30px rgba(247, 187, 46, 0.06)" : "none",
              animation: flashIdx === i ? "cloneFlash 2s ease-out" : undefined,
            }}
          >
            {/* Header */}
            <div
              onClick={() => toggle(i)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 0.75rem",
                cursor: "pointer",
                userSelect: "none",
                background: isOpen ? "var(--accent)" : "transparent",
                borderRadius: isOpen ? undefined : "7px",
                ...(isOpen ? { borderRadius: "7px 7px 0 0" } : {}),
              }}
            >
              {isOpen ? <ChevronDown style={{ width: 14, height: 14, flexShrink: 0 }} /> : <ChevronRight style={{ width: 14, height: 14, flexShrink: 0 }} />}
              {/* Type badge */}
              <span style={{
                fontSize: "0.65rem",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                padding: "0.1rem 0.4rem",
                borderRadius: "4px",
                background: "var(--primary)",
                color: "var(--primary-foreground)",
                flexShrink: 0,
              }}>
                {config?.label ?? blockType}
              </span>
              <span style={{ flex: 1, fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
                {getBlockLabel(block, config)}
              </span>
              {!locked && (
                <span style={{ display: "flex", gap: "0.25rem", alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                  <button type="button" disabled={i === 0} onClick={() => moveBlock(i, -1)} style={{ background: "none", border: "none", cursor: i === 0 ? "not-allowed" : "pointer", color: "var(--muted-foreground)", padding: "2px", opacity: i === 0 ? 0.3 : 1 }}>
                    <ArrowUp style={{ width: 14, height: 14 }} />
                  </button>
                  <button type="button" disabled={i === blocks.length - 1} onClick={() => moveBlock(i, 1)} style={{ background: "none", border: "none", cursor: i === blocks.length - 1 ? "not-allowed" : "pointer", color: "var(--muted-foreground)", padding: "2px", opacity: i === blocks.length - 1 ? 0.3 : 1 }}>
                    <ArrowDown style={{ width: 14, height: 14 }} />
                  </button>
                  <button type="button" onClick={() => cloneBlock(i)} title="Clone block" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "2px" }} className="hover:text-primary transition-colors">
                    <Copy style={{ width: 14, height: 14 }} />
                  </button>
                  {confirmRemoveIdx === i ? (
                    <>
                      <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Remove?</span>
                      <button type="button" onClick={() => {
                        if (confirmTimer.current) clearTimeout(confirmTimer.current);
                        setConfirmRemoveIdx(null);
                        removeBlock(i);
                      }} style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "none", background: "var(--destructive)", color: "#fff", cursor: "pointer", lineHeight: 1 }}>Yes</button>
                      <button type="button" onClick={() => {
                        if (confirmTimer.current) clearTimeout(confirmTimer.current);
                        setConfirmRemoveIdx(null);
                      }} style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}>No</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => {
                      if (confirmTimer.current) clearTimeout(confirmTimer.current);
                      setConfirmRemoveIdx(i);
                      confirmTimer.current = setTimeout(() => setConfirmRemoveIdx(null), 3000);
                    }} style={{ width: "18px", height: "18px", borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)", fontSize: "0.9rem", lineHeight: 1, flexShrink: 0 }} title="Remove block" className="hover:text-destructive transition-colors">×</button>
                  )}
                </span>
              )}
            </div>
            {/* Fields */}
            {isOpen && (
              <div style={{ padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.75rem", borderTop: "1px solid var(--border)" }}>
                {blockType === "columns" ? (
                  <ColumnsEditor
                    block={block}
                    onChange={(updated) => {
                      const next = blocks.map((b, j) => (j === i ? updated : b));
                      onChange(next);
                    }}
                    locked={locked}
                    blocksConfig={blocksConfig}
                  />
                ) : (
                  <>
                    {fields.length === 0 && (
                      <div style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
                        No block definition found for &ldquo;{blockType}&rdquo;
                      </div>
                    )}
                    {fields.map((f) => (
                      <div key={f.name}>
                        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, marginBottom: "0.25rem", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          {f.label ?? f.name}
                        </label>
                        <FieldEditor
                          field={f}
                          value={block[f.name]}
                          onChange={(val) => updateBlockField(i, f.name, val)}
                          locked={locked}
                          blocksConfig={blocksConfig}
                        />
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
      {/* Add block */}
      {!locked && (
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setShowPicker((p) => !p)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              background: "none",
              border: "1px dashed var(--border)",
              borderRadius: "6px",
              cursor: "pointer",
              color: "var(--muted-foreground)",
              fontSize: "0.8rem",
              padding: "0.35rem 0.75rem",
            }}
            className="hover:border-[#4ade80] hover:text-[#4ade80] hover:shadow-[0_0_12px_rgba(74,222,128,0.3)] transition-all"
          >
            <Plus style={{ width: 14, height: 14 }} /> Add block
          </button>
          {showPicker && (
            <div style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              zIndex: 50,
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
              minWidth: "180px",
              overflow: "hidden",
            }}>
              {allowedBlockNames.map((name) => {
                const cfg = getConfig(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => addBlock(name)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "0.5rem 0.75rem",
                      fontSize: "0.85rem",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                    className="hover:bg-accent"
                  >
                    <span style={{
                      fontSize: "0.65rem",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      padding: "0.1rem 0.4rem",
                      borderRadius: "4px",
                      background: "var(--primary)",
                      color: "var(--primary-foreground)",
                    }}>
                      {cfg?.label ?? name}
                    </span>
                  </button>
                );
              })}
              {allowedBlockNames.length === 0 && (
                <div style={{ padding: "0.75rem", fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
                  No block types available
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {/* Clone flash animation */}
      <style>{`
        @keyframes cloneFlash {
          0% { box-shadow: 0 0 30px rgba(247, 187, 46, 0.7), inset 0 0 40px rgba(247, 187, 46, 0.12); }
          50% { box-shadow: 0 0 20px rgba(247, 187, 46, 0.4), inset 0 0 20px rgba(247, 187, 46, 0.05); }
          100% { box-shadow: none; }
        }
      `}</style>
    </div>
  );
}
