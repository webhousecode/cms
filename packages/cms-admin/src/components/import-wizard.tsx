"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, ArrowRight, ArrowLeft, Check, AlertTriangle, FileSpreadsheet, X } from "lucide-react";
import { CustomSelect } from "@/components/custom-select";

interface FieldConfig {
  name: string;
  type: string;
  label?: string;
}

interface FieldMapping {
  sourceField: string;
  targetField: string;
  transform?: string;
}

interface PreviewRow {
  rowIndex: number;
  sourceData: Record<string, unknown>;
  mappedData: Record<string, unknown>;
  slug: string;
  errors: Array<{ field: string; message: string }>;
  valid: boolean;
}

interface ImportResult {
  totalRows: number;
  imported: number;
  skipped: number;
  errors: Array<{ row: number; field: string; message: string }>;
}

const TRANSFORMS = [
  { value: "none", label: "None" },
  { value: "slugify", label: "Slugify" },
  { value: "date-iso", label: "Date → ISO" },
  { value: "split-comma", label: "Split commas → array" },
  { value: "number", label: "To number" },
  { value: "boolean", label: "To boolean" },
];

export function ImportWizard({
  collection,
  collectionLabel,
  fields,
  titleField,
  onClose,
  onComplete,
}: {
  collection: string;
  collectionLabel: string;
  fields: FieldConfig[];
  titleField: string;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [fileContent, setFileContent] = useState<string>("");
  const [format, setFormat] = useState<string>("");
  const [sourceFields, setSourceFields] = useState<string[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Step 1: Upload ──
  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/admin/import/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setFormat(data.format);
      setSourceFields(data.fields);
      setRowCount(data.rowCount);
      setFileContent(await file.text());

      // Auto-suggest mappings via preview endpoint
      const previewRes = await fetch("/api/admin/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: await file.text(),
          format: data.format,
          collection,
          titleField,
        }),
      });
      const previewData = await previewRes.json();
      if (previewRes.ok && previewData.mappings) {
        setMappings(previewData.mappings);
      }

      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2 → 3: Preview ──
  async function handlePreview() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: fileContent,
          format,
          mappings,
          collection,
          titleField,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPreviewRows(data.rows);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 3 → 4: Execute ──
  async function handleExecute() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/import/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: fileContent,
          format,
          mappings,
          collection,
          titleField,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      setStep(4);
      // Notify workspace to refresh
      window.dispatchEvent(new Event("cms:content-changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  function updateMapping(index: number, patch: Partial<FieldMapping>) {
    setMappings((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  function addMapping() {
    setMappings((prev) => [...prev, { sourceField: sourceFields[0] ?? "", targetField: fields[0]?.name ?? "", transform: "none" }]);
  }

  function removeMapping(index: number) {
    setMappings((prev) => prev.filter((_, i) => i !== index));
  }

  const validRows = previewRows.filter((r) => r.valid).length;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.5)",
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "var(--background)", borderRadius: 12, width: "min(720px, 90vw)",
        maxHeight: "85vh", overflow: "auto",
        border: "1px solid var(--border)", boxShadow: "0 16px 48px rgba(0,0,0,0.3)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <FileSpreadsheet style={{ width: 18, height: 18, color: "#F7BB2E" }} />
            <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>
              Import into {collectionLabel}
            </span>
            <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>
              Step {step} of 4
            </span>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--muted-foreground)", padding: "4px",
          }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "1.25rem" }}>
          {error && (
            <div style={{
              padding: "0.5rem 0.75rem", borderRadius: 6, marginBottom: "1rem",
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
              fontSize: "0.78rem", color: "#ef4444",
            }}>
              {error}
            </div>
          )}

          {/* ── Step 1: Upload ── */}
          {step === 1 && (
            <div>
              <p style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
                Upload a CSV, JSON, or Markdown file. Multiple .md files are merged into one import batch.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.json,.md,.markdown,.tsv"
                multiple
                style={{ fontSize: "0.82rem", marginBottom: "1rem" }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button
                  onClick={handleUpload}
                  disabled={loading}
                  style={btnPrimary(loading)}
                >
                  {loading ? "Parsing..." : "Upload & Detect"}
                  <ArrowRight style={{ width: 14, height: 14 }} />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Map Fields ── */}
          {step === 2 && (
            <div>
              <p style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", marginBottom: "0.5rem" }}>
                Detected <strong>{rowCount}</strong> rows, <strong>{sourceFields.length}</strong> fields ({format.toUpperCase()}).
                Map source fields to collection schema.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
                {mappings.map((m, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <CustomSelect
                      value={m.sourceField}
                      options={sourceFields.map((f) => ({ value: f, label: f }))}
                      onChange={(v) => updateMapping(i, { sourceField: v })}
                      style={{ flex: 1, fontSize: "0.78rem" }}
                    />
                    <ArrowRight style={{ width: 14, height: 14, color: "var(--muted-foreground)", flexShrink: 0 }} />
                    <CustomSelect
                      value={m.targetField}
                      options={fields.map((f) => ({ value: f.name, label: f.label ?? f.name }))}
                      onChange={(v) => updateMapping(i, { targetField: v })}
                      style={{ flex: 1, fontSize: "0.78rem" }}
                    />
                    <CustomSelect
                      value={m.transform ?? "none"}
                      options={TRANSFORMS}
                      onChange={(v) => updateMapping(i, { transform: v })}
                      style={{ width: 130, fontSize: "0.72rem" }}
                    />
                    <button onClick={() => removeMapping(i)} style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: "var(--muted-foreground)", padding: "2px",
                    }}>
                      <X style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                ))}
              </div>

              <button onClick={addMapping} style={{
                fontSize: "0.72rem", color: "var(--muted-foreground)",
                background: "none", border: "1px dashed var(--border)",
                borderRadius: 6, padding: "0.3rem 0.6rem", cursor: "pointer",
                marginBottom: "1rem",
              }}>
                + Add mapping
              </button>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <button onClick={() => setStep(1)} style={btnSecondary()}>
                  <ArrowLeft style={{ width: 14, height: 14 }} /> Back
                </button>
                <button onClick={handlePreview} disabled={loading || mappings.length === 0} style={btnPrimary(loading)}>
                  {loading ? "Previewing..." : "Preview"} <ArrowRight style={{ width: 14, height: 14 }} />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Preview ── */}
          {step === 3 && (
            <div>
              <p style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", marginBottom: "0.75rem" }}>
                <strong>{validRows}</strong> of {previewRows.length} rows valid.
                {previewRows.length - validRows > 0 && (
                  <span style={{ color: "#f59e0b" }}> {previewRows.length - validRows} will be skipped.</span>
                )}
              </p>

              <div style={{ overflow: "auto", maxHeight: "40vh", marginBottom: "1rem" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.72rem" }}>
                  <thead>
                    <tr style={{ background: "var(--muted)", position: "sticky", top: 0 }}>
                      <th style={th}>#</th>
                      <th style={th}>Slug</th>
                      {mappings.map((m) => (
                        <th key={m.targetField} style={th}>{m.targetField}</th>
                      ))}
                      <th style={th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.slice(0, 50).map((row) => (
                      <tr key={row.rowIndex} style={{
                        borderBottom: "1px solid var(--border)",
                        background: row.valid ? "transparent" : "rgba(239,68,68,0.04)",
                      }}>
                        <td style={td}>{row.rowIndex + 1}</td>
                        <td style={{ ...td, fontFamily: "monospace", fontSize: "0.68rem" }}>{row.slug}</td>
                        {mappings.map((m) => (
                          <td key={m.targetField} style={td}>
                            {truncate(String(row.mappedData[m.targetField] ?? ""), 40)}
                          </td>
                        ))}
                        <td style={td}>
                          {row.valid ? (
                            <Check style={{ width: 12, height: 12, color: "#22c55e" }} />
                          ) : (
                            <span title={row.errors.map((e) => `${e.field}: ${e.message}`).join(", ")}>
                              <AlertTriangle style={{ width: 12, height: 12, color: "#f59e0b" }} />
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <button onClick={() => setStep(2)} style={btnSecondary()}>
                  <ArrowLeft style={{ width: 14, height: 14 }} /> Back
                </button>
                <button
                  onClick={handleExecute}
                  disabled={loading || validRows === 0}
                  style={btnPrimary(loading)}
                >
                  {loading ? "Importing..." : `Import ${validRows} documents`}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Done ── */}
          {step === 4 && result && (
            <div>
              <div style={{
                padding: "1rem", borderRadius: 8, marginBottom: "1rem",
                background: result.errors.length === 0 ? "rgba(34,197,94,0.08)" : "rgba(250,180,50,0.08)",
                border: `1px solid ${result.errors.length === 0 ? "rgba(34,197,94,0.2)" : "rgba(250,180,50,0.2)"}`,
              }}>
                <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.25rem" }}>
                  <Check style={{ width: 16, height: 16, display: "inline", verticalAlign: "text-bottom", color: "#22c55e", marginRight: 4 }} />
                  Import complete
                </div>
                <div style={{ fontSize: "0.82rem", color: "var(--muted-foreground)" }}>
                  {result.imported} documents created as drafts · {result.skipped} skipped
                  {result.errors.length > 0 && ` · ${result.errors.length} errors`}
                </div>
              </div>

              {result.errors.length > 0 && (
                <div style={{ fontSize: "0.72rem", color: "#f59e0b", marginBottom: "1rem" }}>
                  {result.errors.slice(0, 10).map((e, i) => (
                    <div key={i}>Row {e.row + 1}: {e.field} — {e.message}</div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button onClick={() => { onComplete(); onClose(); }} style={btnPrimary(false)}>
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Shared styles ──

function btnPrimary(disabled: boolean): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: "0.35rem",
    padding: "0.45rem 0.85rem", borderRadius: 6, border: "none",
    background: "#F7BB2E", color: "#0D0D0D", fontSize: "0.8rem", fontWeight: 600,
    cursor: disabled ? "wait" : "pointer", opacity: disabled ? 0.7 : 1,
  };
}

function btnSecondary(): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: "0.35rem",
    padding: "0.45rem 0.85rem", borderRadius: 6, fontSize: "0.8rem",
    border: "1px solid var(--border)", background: "transparent",
    color: "var(--foreground)", fontWeight: 500, cursor: "pointer",
  };
}

const th: React.CSSProperties = {
  textAlign: "left", padding: "0.35rem 0.5rem", fontWeight: 600,
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "0.3rem 0.5rem", whiteSpace: "nowrap", overflow: "hidden",
  textOverflow: "ellipsis", maxWidth: 200,
};

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
