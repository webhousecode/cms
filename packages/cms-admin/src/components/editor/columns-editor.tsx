"use client";

import type { BlockConfig } from "@webhouse/cms";
import { BlocksEditor } from "./blocks-editor";
import { useState } from "react";

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

  // Ensure columns array matches layout count
  const normalizedColumns: Record<string, unknown>[][] = [];
  for (let i = 0; i < colCount; i++) {
    normalizedColumns.push(columns[i] ?? []);
  }

  function updateLayout(newLayout: string) {
    const newColCount = getColumnCount(newLayout);
    const newColumns: Record<string, unknown>[][] = [];
    for (let i = 0; i < newColCount; i++) {
      newColumns.push(columns[i] ?? []);
    }
    onChange({ ...block, layout: newLayout, columns: newColumns });
  }

  function updateColumn(colIndex: number, newBlocks: Record<string, unknown>[]) {
    const newColumns = [...normalizedColumns];
    newColumns[colIndex] = newBlocks;
    onChange({ ...block, columns: newColumns });
  }

  // Filter out "columns" from allowed nested blocks (no nesting)
  const nestedBlocksConfig = blocksConfig.filter((b) => b.name !== "columns");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
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
              border: "1px dashed var(--border)",
              borderRadius: "6px",
              padding: "0.5rem",
              minHeight: "80px",
              background: "var(--background)",
            }}
          >
            <div
              style={{
                fontSize: "0.6rem",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--muted-foreground)",
                marginBottom: "0.4rem",
                paddingLeft: "0.25rem",
              }}
            >
              Column {colIdx + 1}
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
    </div>
  );
}
