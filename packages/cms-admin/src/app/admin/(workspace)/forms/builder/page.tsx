"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ActionBar, ActionBarBreadcrumb } from "@/components/action-bar";
import { Trash2, Plus, GripVertical } from "lucide-react";

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "textarea", label: "Textarea" },
  { value: "select", label: "Select" },
  { value: "checkbox", label: "Checkbox" },
  { value: "number", label: "Number" },
  { value: "phone", label: "Phone" },
  { value: "url", label: "URL" },
  { value: "date", label: "Date" },
  { value: "hidden", label: "Hidden" },
];

interface Field {
  name: string;
  type: string;
  label: string;
  required: boolean;
  placeholder: string;
  options?: Array<{ label: string; value: string }>;
}

export default function FormBuilderPage() {
  const router = useRouter();
  const params = useSearchParams();
  const editName = params.get("edit");

  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [fields, setFields] = useState<Field[]>([
    { name: "name", type: "text", label: "Name", required: true, placeholder: "" },
    { name: "email", type: "email", label: "Email", required: true, placeholder: "" },
    { name: "message", type: "textarea", label: "Message", required: true, placeholder: "" },
  ]);
  const [successMessage, setSuccessMessage] = useState("Thank you!");
  const [notifyEmails, setNotifyEmails] = useState("");
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [autoReplySubject, setAutoReplySubject] = useState("Thanks for reaching out!");
  const [autoReplyBody, setAutoReplyBody] = useState("Hi {{name}},\n\nWe received your message and will get back to you shortly.");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [isEdit, setIsEdit] = useState(false);

  useEffect(() => {
    if (!editName) return;
    fetch(`/api/admin/forms/${editName}`)
      .then((r) => r.json())
      .then((d: { form?: Record<string, unknown> }) => {
        if (!d.form) return;
        const f = d.form as Record<string, unknown>;
        setName(String(f.name ?? ""));
        setLabel(String(f.label ?? ""));
        setFields((f.fields as Field[]) ?? []);
        setSuccessMessage(String(f.successMessage ?? "Thank you!"));
        const notif = f.notifications as Record<string, unknown> | undefined;
        setNotifyEmails((notif?.email as string[] ?? []).join(", "));
        const ar = f.autoReply as Record<string, unknown> | undefined;
        if (ar?.enabled) {
          setAutoReplyEnabled(true);
          setAutoReplySubject(String(ar.subject ?? ""));
          setAutoReplyBody(String(ar.body ?? ""));
        }
        setIsEdit(true);
      })
      .catch(() => {});
  }, [editName]);

  function addField() {
    setFields([...fields, { name: "", type: "text", label: "", required: false, placeholder: "" }]);
  }

  function updateField(idx: number, patch: Partial<Field>) {
    setFields(fields.map((f, i) => i === idx ? { ...f, ...patch } : f));
  }

  function removeField(idx: number) {
    setFields(fields.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    setError("");
    if (!name || !label || fields.length === 0) {
      setError("Name, label, and at least one field are required");
      return;
    }
    // Auto-generate field names from labels if empty
    const cleanFields = fields.map((f) => ({
      ...f,
      name: f.name || f.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
    }));

    const payload: Record<string, unknown> = {
      name,
      label,
      fields: cleanFields,
      successMessage,
      notifications: {
        email: notifyEmails.split(",").map((e) => e.trim()).filter(Boolean),
      },
    };
    if (autoReplyEnabled) {
      payload.autoReply = {
        enabled: true,
        subject: autoReplySubject,
        body: autoReplyBody,
      };
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      router.push("/admin/forms");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    padding: "0.45rem 0.65rem",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--background)",
    color: "var(--foreground)",
    fontSize: "0.85rem",
    width: "100%",
    boxSizing: "border-box" as const,
  };

  return (
    <>
      <ActionBar>
        <ActionBarBreadcrumb items={["Forms", isEdit ? `Edit: ${label || name}` : "New Form"]} />
      </ActionBar>
      <div className="p-8 max-w-3xl space-y-6">
        {/* Name + Label */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>Form ID</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="contact"
              disabled={isEdit}
              style={{ ...inputStyle, opacity: isEdit ? 0.6 : 1 }}
            />
            <p style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", marginTop: "0.2rem" }}>Endpoint: /api/forms/{name || "..."}</p>
          </div>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>Label</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Contact Form" style={inputStyle} />
          </div>
        </div>

        {/* Fields */}
        <div>
          <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: "0.5rem" }}>Fields</label>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {fields.map((f, idx) => (
              <div key={idx} style={{ display: "flex", gap: "0.5rem", alignItems: "center", padding: "0.5rem 0.65rem", border: "1px solid var(--border)", borderRadius: 6, background: "var(--card)" }}>
                <GripVertical size={14} style={{ color: "var(--muted-foreground)", flexShrink: 0, cursor: "grab" }} />
                <input value={f.label} onChange={(e) => updateField(idx, { label: e.target.value })} placeholder="Label" style={{ ...inputStyle, flex: "1 1 120px" }} />
                <input value={f.name} onChange={(e) => updateField(idx, { name: e.target.value })} placeholder="field_name" style={{ ...inputStyle, flex: "0 1 120px", fontFamily: "var(--font-mono, monospace)", fontSize: "0.78rem" }} />
                <select value={f.type} onChange={(e) => updateField(idx, { type: e.target.value })} style={{ ...inputStyle, flex: "0 0 100px" }}>
                  {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.75rem", whiteSpace: "nowrap", cursor: "pointer" }}>
                  <input type="checkbox" checked={f.required} onChange={(e) => updateField(idx, { required: e.target.checked })} />
                  Req
                </label>
                <button onClick={() => removeField(idx)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--destructive)", padding: 4 }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={addField} style={{ marginTop: "0.5rem", display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.78rem", padding: "0.35rem 0.7rem", borderRadius: 5, border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", cursor: "pointer" }}>
            <Plus size={14} /> Add field
          </button>
        </div>

        {/* Success message */}
        <div>
          <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>Success message</label>
          <input value={successMessage} onChange={(e) => setSuccessMessage(e.target.value)} style={inputStyle} />
        </div>

        {/* Notifications */}
        <div>
          <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>Notification emails (comma-separated)</label>
          <input value={notifyEmails} onChange={(e) => setNotifyEmails(e.target.value)} placeholder="admin@example.com" style={inputStyle} />
        </div>

        {/* Auto-reply */}
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "1rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" }}>
            <input type="checkbox" checked={autoReplyEnabled} onChange={(e) => setAutoReplyEnabled(e.target.checked)} />
            Send auto-reply to submitter
          </label>
          {autoReplyEnabled && (
            <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div>
                <label style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>Subject</label>
                <input value={autoReplySubject} onChange={(e) => setAutoReplySubject(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>Body (supports {"{{fieldName}}"} placeholders)</label>
                <textarea value={autoReplyBody} onChange={(e) => setAutoReplyBody(e.target.value)} rows={4} style={{ ...inputStyle, resize: "vertical" }} />
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {error && <p style={{ fontSize: "0.8rem", color: "var(--destructive)" }}>{error}</p>}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "0.5rem 1.25rem", borderRadius: 6, border: "none",
              background: "var(--primary)", color: "var(--primary-foreground)",
              fontWeight: 600, fontSize: "0.85rem", cursor: saving ? "wait" : "pointer",
            }}
          >
            {saving ? "Saving…" : isEdit ? "Update form" : "Create form"}
          </button>
          <button
            onClick={() => router.push("/admin/forms")}
            style={{
              padding: "0.5rem 1.25rem", borderRadius: 6,
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--foreground)", fontSize: "0.85rem", cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
