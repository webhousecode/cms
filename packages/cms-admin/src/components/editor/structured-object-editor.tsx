"use client";

import type { FieldConfig, BlockConfig } from "@webhouse/cms";
import { FieldEditor } from "./field-editor";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

interface Props {
  field: FieldConfig;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  locked?: boolean;
  blocksConfig?: BlockConfig[];
}

export function StructuredObjectEditor({ field, value, onChange, locked, blocksConfig }: Props) {
  const obj = (typeof value === "object" && value !== null && !Array.isArray(value)) ? value : {};
  const fields = field.fields ?? [];
  const [collapsed, setCollapsed] = useState(false);

  function updateField(fieldName: string, val: unknown) {
    onChange({ ...obj, [fieldName]: val });
  }

  // Preview: show first text field value
  let preview = "";
  for (const f of fields) {
    if ((f.type === "text" || f.type === "textarea") && obj[f.name]) {
      preview = String(obj[f.name]);
      if (preview.length > 40) preview = preview.slice(0, 40) + "…";
      break;
    }
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "8px", background: "var(--card)", overflow: "hidden" }}>
      <div
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: "flex", alignItems: "center", gap: "0.5rem",
          padding: "0.5rem 0.75rem", cursor: "pointer", userSelect: "none",
          background: collapsed ? "transparent" : "var(--accent)",
        }}
      >
        {collapsed
          ? <ChevronRight style={{ width: 14, height: 14, flexShrink: 0 }} />
          : <ChevronDown style={{ width: 14, height: 14, flexShrink: 0 }} />
        }
        <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>
          {field.label ?? field.name}
        </span>
        {collapsed && preview && (
          <span style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", marginLeft: "0.25rem" }}>
            — {preview}
          </span>
        )}
      </div>
      {!collapsed && (
        <div style={{ padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.75rem", borderTop: "1px solid var(--border)" }}>
          {fields.map((f) => (
            <div key={f.name}>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, marginBottom: "0.25rem", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {f.label ?? f.name}
              </label>
              <FieldEditor
                field={f}
                value={obj[f.name]}
                onChange={(val) => updateField(f.name, val)}
                locked={locked}
                blocksConfig={blocksConfig}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
