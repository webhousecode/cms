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

function getItemLabel(item: Record<string, unknown>, fields: FieldConfig[], index: number): string {
  // Use first text-ish field value as label
  for (const f of fields) {
    if ((f.type === "text" || f.type === "textarea") && item[f.name]) {
      const val = String(item[f.name]);
      return val.length > 50 ? val.slice(0, 50) + "…" : val;
    }
  }
  return `Item ${index + 1}`;
}

export function StructuredArrayEditor({ field, value, onChange, locked, blocksConfig }: Props) {
  const items = Array.isArray(value) ? value : [];
  const fields = field.fields ?? [];
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  function toggle(i: number) {
    setExpanded((prev) => ({ ...prev, [i]: !prev[i] }));
  }

  function updateItem(index: number, fieldName: string, val: unknown) {
    const next = items.map((item, i) =>
      i === index ? { ...item, [fieldName]: val } : item
    );
    onChange(next);
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function moveItem(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    // Update expanded state
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

  function addItem() {
    const empty: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.type === "boolean") empty[f.name] = false;
      else if (f.type === "array") empty[f.name] = [];
      else if (f.type === "object" || f.type === "blocks") empty[f.name] = f.type === "blocks" ? [] : {};
      else empty[f.name] = f.defaultValue ?? "";
    }
    const newIndex = items.length;
    setExpanded((prev) => ({ ...prev, [newIndex]: true }));
    onChange([...items, empty]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {items.length === 0 && (
        <div style={{ padding: "1rem", textAlign: "center", color: "var(--muted-foreground)", fontSize: "0.85rem", border: "1px dashed var(--border)", borderRadius: "8px" }}>
          No items added
        </div>
      )}
      {items.map((item, i) => {
        const isOpen = expanded[i] ?? false;
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
              <span style={{ flex: 1, fontSize: "0.85rem", fontWeight: 500 }}>
                {getItemLabel(item, fields, i)}
              </span>
              {!locked && (
                <span style={{ display: "flex", gap: "0.25rem", alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                  <button type="button" disabled={i === 0} onClick={() => moveItem(i, -1)} style={{ background: "none", border: "none", cursor: i === 0 ? "not-allowed" : "pointer", color: "var(--muted-foreground)", padding: "2px", opacity: i === 0 ? 0.3 : 1 }}>
                    <ArrowUp style={{ width: 14, height: 14 }} />
                  </button>
                  <button type="button" disabled={i === items.length - 1} onClick={() => moveItem(i, 1)} style={{ background: "none", border: "none", cursor: i === items.length - 1 ? "not-allowed" : "pointer", color: "var(--muted-foreground)", padding: "2px", opacity: i === items.length - 1 ? 0.3 : 1 }}>
                    <ArrowDown style={{ width: 14, height: 14 }} />
                  </button>
                  <button type="button" onClick={() => removeItem(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "2px" }} className="hover:text-destructive transition-colors">
                    <Trash2 style={{ width: 14, height: 14 }} />
                  </button>
                </span>
              )}
            </div>
            {/* Fields */}
            {isOpen && (
              <div style={{ padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.75rem", borderTop: "1px solid var(--border)" }}>
                {fields.map((f) => (
                  <div key={f.name}>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, marginBottom: "0.25rem", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {f.label ?? f.name}
                    </label>
                    <FieldEditor
                      field={f}
                      value={item[f.name]}
                      onChange={(val) => updateItem(i, f.name, val)}
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
      {!locked && (
        <button
          type="button"
          onClick={addItem}
          style={{
            alignSelf: "flex-start",
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
          <Plus style={{ width: 14, height: 14 }} /> Add item
        </button>
      )}
    </div>
  );
}
