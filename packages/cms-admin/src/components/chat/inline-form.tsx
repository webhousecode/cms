"use client";

import { useState, useCallback } from "react";
import { Save, Loader2, Check, X } from "lucide-react";
import type { InlineFormData, InlineFormField } from "./message-list";
import { CustomDateInput } from "@/components/ui/custom-date-input";

interface InlineFormProps {
  form: InlineFormData;
  onSaved?: (summary: string) => void;
}

export function InlineForm({ form, onSaved }: InlineFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const v: Record<string, unknown> = {};
    for (const f of form.fields) v[f.name] = f.value;
    return v;
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = useCallback((name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/cms/${form.collection}/${form.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: values }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Save failed" }));
        setError(err.error ?? "Save failed");
      } else {
        setSaved(true);
        const changedFields = form.fields
          .filter((f) => JSON.stringify(values[f.name]) !== JSON.stringify(f.value))
          .map((f) => f.label)
          .join(", ");
        onSaved?.(changedFields ? `Updated: ${changedFields}` : "No changes");
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      setError("Network error");
    }
    setSaving(false);
  }, [form, values, onSaved]);

  return (
    <div
      style={{
        margin: "10px 0",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        overflow: "hidden",
        backgroundColor: "var(--card)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "0.8rem",
          fontWeight: 600,
          color: "var(--foreground)",
        }}
      >
        <span>Edit: {form.title}</span>
        <span style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", fontFamily: "monospace" }}>
          {form.collection}/{form.slug}
        </span>
      </div>

      {/* Fields */}
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {form.fields.map((field) => (
          <FieldEditor
            key={field.name}
            field={field}
            value={values[field.name]}
            onChange={(v) => updateField(field.name, v)}
          />
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "10px 14px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 14px",
            borderRadius: "6px",
            border: "none",
            fontSize: "0.8rem",
            fontWeight: 500,
            cursor: saving ? "wait" : "pointer",
            backgroundColor: saved ? "rgb(74 222 128)" : "var(--primary)",
            color: saved ? "#000" : "var(--primary-foreground)",
            transition: "all 150ms",
          }}
        >
          {saving ? (
            <Loader2 style={{ width: "14px", height: "14px" }} className="animate-spin" />
          ) : saved ? (
            <Check style={{ width: "14px", height: "14px" }} />
          ) : (
            <Save style={{ width: "14px", height: "14px" }} />
          )}
          {saving ? "Saving..." : saved ? "Saved" : "Save"}
        </button>
        {error && (
          <span style={{ fontSize: "0.75rem", color: "var(--destructive)" }}>{error}</span>
        )}
      </div>
    </div>
  );
}

function FieldEditor({ field, value, onChange }: { field: InlineFormField; value: unknown; onChange: (v: unknown) => void }) {
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.7rem",
    fontWeight: 600,
    color: "var(--muted-foreground)",
    marginBottom: "4px",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: "6px",
    border: "1px solid var(--border)",
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    fontSize: "0.85rem",
    fontFamily: "inherit",
    outline: "none",
  };

  switch (field.type) {
    case "text":
      return (
        <div>
          <label style={labelStyle}>{field.label}{field.required && " *"}</label>
          <input
            type="text"
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            style={inputStyle}
          />
        </div>
      );

    case "textarea":
      return (
        <div>
          <label style={labelStyle}>{field.label}{field.required && " *"}</label>
          <textarea
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            style={{ ...inputStyle, resize: "vertical", minHeight: "80px" }}
          />
        </div>
      );

    case "select":
      return (
        <div>
          <label style={labelStyle}>{field.label}{field.required && " *"}</label>
          <select
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            <option value="">— Select —</option>
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      );

    case "boolean":
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            onClick={() => onChange(!value)}
            style={{
              width: "36px",
              height: "20px",
              borderRadius: "10px",
              border: "none",
              cursor: "pointer",
              backgroundColor: value ? "var(--primary)" : "var(--muted)",
              position: "relative",
              transition: "background 150ms",
            }}
          >
            <div
              style={{
                width: "16px",
                height: "16px",
                borderRadius: "50%",
                backgroundColor: "#fff",
                position: "absolute",
                top: "2px",
                left: value ? "18px" : "2px",
                transition: "left 150ms",
              }}
            />
          </button>
          <label style={{ fontSize: "0.85rem", color: "var(--foreground)" }}>{field.label}</label>
        </div>
      );

    case "date":
      return (
        <div>
          <label style={labelStyle}>{field.label}{field.required && " *"}</label>
          <CustomDateInput value={String(value ?? "").slice(0, 10)} onChange={onChange} />
        </div>
      );

    case "tags":
      return (
        <div>
          <label style={labelStyle}>{field.label}</label>
          <input
            type="text"
            value={Array.isArray(value) ? (value as string[]).join(", ") : String(value ?? "")}
            onChange={(e) => onChange(e.target.value.split(",").map((t) => t.trim()).filter(Boolean))}
            placeholder="tag1, tag2, tag3"
            style={inputStyle}
          />
        </div>
      );

    default:
      return (
        <div>
          <label style={labelStyle}>{field.label}</label>
          <input
            type="text"
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            style={inputStyle}
          />
        </div>
      );
  }
}
