"use client";

import type { FieldConfig, BlockConfig } from "@webhouse/cms";
import { FieldEditor } from "./field-editor";
import { ChevronDown, ChevronRight, Trash2, ArrowUp, ArrowDown, Plus } from "lucide-react";
import { useState } from "react";

interface Props {
  field: FieldConfig;
  value: Record<string, unknown>[];
  onChange: (value: Record<string, unknown>[]) => void;
  locked?: boolean;
  blocksConfig?: BlockConfig[];
}

function getBlockLabel(block: Record<string, unknown>, config: BlockConfig | undefined): string {
  if (!config) return String(block._block ?? "Unknown");
  // Use first text field value if available
  for (const f of config.fields) {
    if ((f.type === "text" || f.type === "textarea") && block[f.name]) {
      const val = String(block[f.name]);
      return val.length > 40 ? val.slice(0, 40) + "…" : val;
    }
  }
  return config.label ?? config.name;
}

export function BlocksEditor({ field, value, onChange, locked, blocksConfig = [] }: Props) {
  const blocks = Array.isArray(value) ? value : [];
  const allowedBlockNames = field.blocks ?? blocksConfig.map((b) => b.name);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [showPicker, setShowPicker] = useState(false);

  function toggle(i: number) {
    setExpanded((prev) => ({ ...prev, [i]: !prev[i] }));
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

  function removeBlock(index: number) {
    onChange(blocks.filter((_, i) => i !== index));
  }

  function moveBlock(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    setExpanded((prev) => {
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
    if (config) {
      for (const f of config.fields) {
        if (f.type === "boolean") empty[f.name] = false;
        else if (f.type === "array" || f.type === "blocks") empty[f.name] = [];
        else if (f.type === "object") empty[f.name] = {};
        else empty[f.name] = f.defaultValue ?? "";
      }
    }
    const newIndex = blocks.length;
    setExpanded((prev) => ({ ...prev, [newIndex]: true }));
    onChange([...blocks, empty]);
    setShowPicker(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
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
            style={{
              border: "1px solid var(--border)",
              borderRadius: "8px",
              background: "var(--card)",
              overflow: "hidden",
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
                  <button type="button" onClick={() => removeBlock(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "2px" }} className="hover:text-destructive transition-colors">
                    <Trash2 style={{ width: 14, height: 14 }} />
                  </button>
                </span>
              )}
            </div>
            {/* Fields */}
            {isOpen && (
              <div style={{ padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.75rem", borderTop: "1px solid var(--border)" }}>
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
            className="hover:border-primary hover:text-primary transition-colors"
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
                      fontSize: "0.6rem",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      padding: "0.05rem 0.3rem",
                      borderRadius: "3px",
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
    </div>
  );
}
