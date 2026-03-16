"use client";

import type { BlockConfig } from "@webhouse/cms";
import { BlocksEditor } from "./blocks-editor";
import { useState, useEffect, useRef } from "react";
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
  const overlayRef = useRef<HTMLDivElement>(null);

  // Ensure columns array matches layout count
  const normalizedColumns: Record<string, unknown>[][] = [];
  for (let i = 0; i < colCount; i++) {
    normalizedColumns.push(columns[i] ?? []);
  }

  // Close on Escape
  useEffect(() => {
    if (focusedCol === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocusedCol(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focusedCol]);

  function updateLayout(newLayout: string) {
    const newColCount = getColumnCount(newLayout);
    const newColumns: Record<string, unknown>[][] = [];
    for (let i = 0; i < newColCount; i++) {
      newColumns.push(columns[i] ?? []);
    }
    onChange({ ...block, layout: newLayout, columns: newColumns });
    // If focused column no longer exists, close focus
    if (focusedCol !== null && focusedCol >= newColCount) {
      setFocusedCol(null);
    }
  }

  function updateColumn(colIndex: number, newBlocks: Record<string, unknown>[]) {
    const newColumns = [...normalizedColumns];
    newColumns[colIndex] = newBlocks;
    onChange({ ...block, columns: newColumns });
  }

  // Filter out "columns" from allowed nested blocks (no nesting)
  const nestedBlocksConfig = blocksConfig.filter((b) => b.name !== "columns");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", position: "relative" }}>
      {/* Layout selector */}
      {!locked && (
        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
          {LAYOUT_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => updateLayout(preset.value)}
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
        </div>
      )}

      {/* Columns grid */}
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
              border: `1px dashed ${focusedCol === colIdx ? "var(--primary)" : "var(--border)"}`,
              borderRadius: "6px",
              padding: "0.5rem",
              minHeight: "80px",
              background: "var(--background)",
              opacity: focusedCol !== null && focusedCol !== colIdx ? 0.4 : 1,
              transition: "opacity 150ms, border-color 150ms",
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
              {colBlocks.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFocusedCol(focusedCol === colIdx ? null : colIdx)}
                  title="Expand column editor"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: focusedCol === colIdx ? "var(--primary)" : "var(--muted-foreground)",
                    padding: "2px",
                    display: "flex",
                    alignItems: "center",
                  }}
                  className="hover:text-primary transition-colors"
                >
                  <Maximize2 style={{ width: 12, height: 12 }} />
                </button>
              )}
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
            />
          </div>
        ))}
      </div>

      {/* Focused column overlay */}
      {focusedCol !== null && (
        <div
          ref={overlayRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 20,
            background: "var(--card)",
            border: "1px solid var(--primary)",
            borderRadius: "8px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            padding: "0.75rem",
            animation: "columnsOverlayIn 150ms ease-out",
          }}
        >
          {/* Overlay header */}
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
          {/* Full-width blocks editor for the focused column */}
          <BlocksEditor
            field={{
              name: `column-${focusedCol}`,
              type: "blocks",
            }}
            value={normalizedColumns[focusedCol]}
            onChange={(newBlocks) => updateColumn(focusedCol, newBlocks as Record<string, unknown>[])}
            locked={locked}
            blocksConfig={nestedBlocksConfig}
          />
        </div>
      )}

      {/* Inline animation keyframes */}
      <style>{`
        @keyframes columnsOverlayIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
