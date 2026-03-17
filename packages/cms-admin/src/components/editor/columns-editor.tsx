"use client";

import type { BlockConfig } from "@webhouse/cms";
import { BlocksEditor } from "./blocks-editor";
import { useState, useEffect } from "react";
import { Maximize2, X } from "lucide-react";

interface ColumnsEditorProps {
  block: Record<string, unknown>;
  onChange: (block: Record<string, unknown>) => void;
  locked?: boolean;
  blocksConfig?: BlockConfig[];
}

const LAYOUT_PRESETS = [
  { value: "1-1", label: "50 / 50", cols: "1fr 1fr" },
  { value: "2-1", label: "66 / 33", cols: "2fr 1fr" },
  { value: "1-2", label: "33 / 66", cols: "1fr 2fr" },
  { value: "1-1-1", label: "3 equal", cols: "1fr 1fr 1fr" },
  { value: "1-1-1-1", label: "4 equal", cols: "repeat(4, 1fr)" },
];

function getColumnCount(layout: string): number {
  return layout.split("-").length;
}

function getGridCols(layout: string): string {
  return LAYOUT_PRESETS.find((p) => p.value === layout)?.cols ?? "1fr 1fr";
}

export function ColumnsEditor({ block, onChange, locked, blocksConfig = [] }: ColumnsEditorProps) {
  const layout = (block.layout as string) || "1-1";
  const columns = Array.isArray(block.columns)
    ? (block.columns as Record<string, unknown>[][])
    : [];

  const colCount = getColumnCount(layout);
  const [focusedCol, setFocusedCol] = useState<number | null>(null);
  const [pendingLayout, setPendingLayout] = useState<string | null>(null);
  // Shared expanded state per column — persisted to localStorage
  const colExpandedKey = "cms-col-expanded";
  const [colExpanded, setColExpanded] = useState<Record<number, Record<number, boolean>>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const stored = localStorage.getItem(colExpandedKey);
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });
  function setColExpandedPersist(updater: (prev: Record<number, Record<number, boolean>>) => Record<number, Record<number, boolean>>) {
    setColExpanded((prev) => {
      const next = updater(prev);
      try { localStorage.setItem(colExpandedKey, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  // Ensure columns array matches layout count
  const normalizedColumns: Record<string, unknown>[][] = [];
  for (let i = 0; i < colCount; i++) {
    normalizedColumns.push(columns[i] ?? []);
  }

  // Close on Escape
  useEffect(() => {
    if (focusedCol === null && pendingLayout === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFocusedCol(null);
        setPendingLayout(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focusedCol, pendingLayout]);

  function applyLayout(newLayout: string) {
    const newColCount = getColumnCount(newLayout);
    const newColumns: Record<string, unknown>[][] = [];
    for (let i = 0; i < newColCount; i++) {
      newColumns.push(columns[i] ?? []);
    }
    onChange({ ...block, layout: newLayout, columns: newColumns });
    if (focusedCol !== null && focusedCol >= newColCount) {
      setFocusedCol(null);
    }
    setPendingLayout(null);
  }

  function requestLayout(newLayout: string) {
    if (newLayout === layout) return;
    const newColCount = getColumnCount(newLayout);
    // Check if any columns with content would be removed
    const willLoseContent = columns
      .slice(newColCount)
      .some((col) => Array.isArray(col) && col.length > 0);
    if (willLoseContent) {
      setPendingLayout(newLayout);
    } else {
      applyLayout(newLayout);
    }
  }

  /** Which column numbers (1-based) will lose content */
  function droppedColumnsWithContent(newLayout: string): number[] {
    const newColCount = getColumnCount(newLayout);
    const dropped: number[] = [];
    for (let i = newColCount; i < columns.length; i++) {
      if (Array.isArray(columns[i]) && columns[i].length > 0) {
        dropped.push(i + 1);
      }
    }
    return dropped;
  }

  function updateColumn(colIndex: number, newBlocks: Record<string, unknown>[]) {
    const newColumns = [...normalizedColumns];
    newColumns[colIndex] = newBlocks;
    onChange({ ...block, columns: newColumns });
  }

  // Filter out "columns" from allowed nested blocks (no nesting)
  const nestedBlocksConfig = blocksConfig.filter((b) => b.name !== "columns");

  // Total block count across all columns (for Open all / Close all)
  const totalBlocks = normalizedColumns.reduce((sum, col) => sum + col.length, 0);
  const allOpen = totalBlocks > 0 && normalizedColumns.every((col, ci) =>
    col.every((_, bi) => (colExpanded[ci] ?? {})[bi])
  );
  const allClosed = totalBlocks > 0 && normalizedColumns.every((col, ci) =>
    col.every((_, bi) => !(colExpanded[ci] ?? {})[bi])
  );

  function toggleAllColumns(open: boolean) {
    setColExpandedPersist(() => {
      const next: Record<number, Record<number, boolean>> = {};
      normalizedColumns.forEach((col, ci) => {
        const colState: Record<number, boolean> = {};
        col.forEach((_, bi) => { colState[bi] = open; });
        next[ci] = colState;
      });
      return next;
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", position: "relative" }}>
      {/* Label + Layout selector */}
      {!locked && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <input
            type="text"
            value={(block.label as string) ?? ""}
            onChange={(e) => onChange({ ...block, label: e.target.value })}
            placeholder="Label (optional — shown in block header)"
            style={{
              padding: "0.3rem 0.5rem", borderRadius: "5px",
              border: "1px solid var(--border)", background: "var(--background)",
              color: "var(--foreground)", fontSize: "0.75rem", outline: "none",
              width: "100%",
            }}
            onFocus={(e) => { e.target.style.borderColor = "var(--primary)"; }}
            onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
          />
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
            {LAYOUT_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => requestLayout(preset.value)}
                style={{
                  padding: "0.25rem 0.6rem",
                  fontSize: "0.7rem",
                  fontWeight: layout === preset.value ? 600 : 400,
                  borderRadius: "4px",
                  border: `1px solid ${layout === preset.value ? "var(--primary)" : "var(--border)"}`,
                  background: layout === preset.value ? "var(--primary)" : "transparent",
                  color: layout === preset.value ? "var(--primary-foreground)" : "var(--muted-foreground)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
                className={layout === preset.value ? "" : "hover:border-primary transition-colors"}
              >
                {preset.label}
              </button>
            ))}
            {/* Open all / Close all — right-aligned */}
            {totalBlocks >= 2 && (
              <div style={{ display: "flex", gap: "0.25rem", marginLeft: "auto" }}>
                <button type="button" onClick={() => toggleAllColumns(true)} disabled={allOpen}
                  style={{ background: "none", border: "none", cursor: allOpen ? "default" : "pointer", fontSize: "0.6rem", color: "var(--muted-foreground)", opacity: allOpen ? 0.4 : 1, padding: "0.1rem 0.3rem" }}
                  className={allOpen ? "" : "hover:text-foreground transition-colors"}>Open all</button>
                <span style={{ fontSize: "0.6rem", color: "var(--muted-foreground)", opacity: 0.3 }}>|</span>
                <button type="button" onClick={() => toggleAllColumns(false)} disabled={allClosed}
                  style={{ background: "none", border: "none", cursor: allClosed ? "default" : "pointer", fontSize: "0.6rem", color: "var(--muted-foreground)", opacity: allClosed ? 0.4 : 1, padding: "0.1rem 0.3rem" }}
                  className={allClosed ? "" : "hover:text-foreground transition-colors"}>Close all</button>
              </div>
            )}
          </div>
          {/* Warning when layout change would remove columns with content */}
          {pendingLayout && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.3rem 0.6rem",
              borderRadius: "4px",
              background: "var(--destructive)/10",
              border: "1px solid var(--destructive)",
              fontSize: "0.7rem",
            }}>
              <span style={{ color: "var(--destructive)", fontWeight: 500 }}>
                Column {droppedColumnsWithContent(pendingLayout).join(", ")} content will be removed.
              </span>
              <button type="button" onClick={() => applyLayout(pendingLayout)}
                style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "none", background: "var(--destructive)", color: "#fff", cursor: "pointer", lineHeight: 1 }}>OK</button>
              <button type="button" onClick={() => setPendingLayout(null)}
                style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}>Cancel</button>
            </div>
          )}
        </div>
      )}

      {/* Focused column — full-width editor replaces grid */}
      {focusedCol !== null ? (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--primary)",
            borderRadius: "8px",
            padding: "0.75rem",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "0.75rem",
              paddingBottom: "0.5rem",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--primary)",
              }}
            >
              Editing Column {focusedCol + 1}
            </span>
            <button
              type="button"
              onClick={() => setFocusedCol(null)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--muted-foreground)",
                padding: "2px",
                display: "flex",
                alignItems: "center",
                gap: "0.3rem",
                fontSize: "0.7rem",
              }}
              className="hover:text-foreground transition-colors"
            >
              Close <X style={{ width: 14, height: 14 }} />
            </button>
          </div>
          {/* Full-width blocks editor */}
          <BlocksEditor
            field={{
              name: `column-${focusedCol}`,
              type: "blocks",
            }}
            value={normalizedColumns[focusedCol]}
            onChange={(newBlocks) => updateColumn(focusedCol, newBlocks as Record<string, unknown>[])}
            locked={locked}
            blocksConfig={nestedBlocksConfig}
            expandedState={colExpanded[focusedCol] ?? {}}
            onExpandedChange={(exp) => setColExpandedPersist((prev) => ({ ...prev, [focusedCol]: exp }))}
          />
        </div>
      ) : (
        /* Columns grid — normal view */
        <div
          style={{
            display: "grid",
            gridTemplateColumns: getGridCols(layout),
            gap: "0.75rem",
          }}
        >
          {normalizedColumns.map((colBlocks, colIdx) => (
            <div
              key={colIdx}
              style={{
                border: "1px dashed var(--border)",
                borderRadius: "6px",
                padding: "0.5rem",
                minHeight: "80px",
                minWidth: 0,
                overflow: "hidden",
                background: "var(--background)",
              }}
            >
              {/* Column header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "0.4rem",
                  paddingLeft: "0.25rem",
                }}
              >
                <span
                  style={{
                    fontSize: "0.6rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--muted-foreground)",
                  }}
                >
                  Column {colIdx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => setFocusedCol(colIdx)}
                  title="Expand column editor"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--muted-foreground)",
                    padding: "2px",
                    display: "flex",
                    alignItems: "center",
                  }}
                  className="hover:text-primary transition-colors"
                >
                  <Maximize2 style={{ width: 12, height: 12 }} />
                </button>
              </div>
              <BlocksEditor
                field={{
                  name: `column-${colIdx}`,
                  type: "blocks",
                }}
                value={colBlocks}
                onChange={(newBlocks) => updateColumn(colIdx, newBlocks as Record<string, unknown>[])}
                locked={locked}
                blocksConfig={nestedBlocksConfig}
                expandedState={colExpanded[colIdx] ?? {}}
                onExpandedChange={(exp) => setColExpandedPersist((prev) => ({ ...prev, [colIdx]: exp }))}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
