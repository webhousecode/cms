import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Screen } from "@/components/Screen";
import { ScreenHeader, BackButton } from "@/components/ScreenHeader";
import { Spinner } from "@/components/Spinner";
import { getDocument, getCollections, saveDocument, deleteDocument } from "@/api/client";
import type { FieldConfig } from "@/api/types";

// ─── Field Editors ───────────────────────────────────

function FieldLabel({ field }: { field: FieldConfig }) {
  return (
    <label className="block text-xs font-medium text-white/50 mb-1.5">
      {field.label}
      {field.required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

function TextField({ field, value, onChange }: FieldEditorProps) {
  return (
    <div>
      <FieldLabel field={field} />
      <input
        type="text"
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder ?? ""}
        className="w-full min-w-0 rounded-lg bg-brand-darkPanel border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-brand-gold transition-colors"
      />
    </div>
  );
}

function TextareaField({ field, value, onChange }: FieldEditorProps) {
  return (
    <div>
      <FieldLabel field={field} />
      <textarea
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder ?? ""}
        rows={4}
        className="w-full min-w-0 rounded-lg bg-brand-darkPanel border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-brand-gold transition-colors resize-y"
      />
    </div>
  );
}

function NumberField({ field, value, onChange }: FieldEditorProps) {
  return (
    <div>
      <FieldLabel field={field} />
      <input
        type="number"
        value={value != null ? String(value) : ""}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? undefined : Number(v));
        }}
        placeholder={field.placeholder ?? ""}
        className="w-full min-w-0 rounded-lg bg-brand-darkPanel border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-brand-gold transition-colors"
      />
    </div>
  );
}

function BooleanField({ field, value, onChange }: FieldEditorProps) {
  const checked = !!value;
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-lg bg-brand-darkPanel border border-white/10 px-3 py-3 active:bg-white/5"
    >
      <span className="text-sm">{field.label}</span>
      <div
        className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${
          checked ? "bg-brand-gold" : "bg-white/20"
        }`}
      >
        <div
          className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </div>
    </button>
  );
}

function DateField({ field, value, onChange }: FieldEditorProps) {
  return (
    <div>
      <FieldLabel field={field} />
      <input
        type="date"
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        style={{ display: "block", width: "100%", boxSizing: "border-box" }}
        className="rounded-lg bg-brand-darkPanel border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-brand-gold transition-colors [color-scheme:dark]"
      />
    </div>
  );
}

function SelectField({ field, value, onChange }: FieldEditorProps) {
  const options = field.options ?? [];
  return (
    <div>
      <FieldLabel field={field} />
      <div className="flex flex-wrap gap-2 overflow-hidden">
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(selected ? undefined : opt.value)}
              className={`rounded-lg px-3 py-2 text-sm border transition-colors active:scale-95 ${
                selected
                  ? "bg-brand-gold/20 border-brand-gold text-brand-gold"
                  : "bg-brand-darkPanel border-white/10 text-white/70"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TagsField({ field, value, onChange }: FieldEditorProps) {
  const tags = Array.isArray(value) ? (value as string[]) : [];
  const [input, setInput] = useState("");

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, "-");
    if (!tag || tags.includes(tag)) return;
    onChange([...tags, tag]);
    setInput("");
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <div>
      <FieldLabel field={field} />
      {/* Existing tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 overflow-hidden mb-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1.5 rounded-full bg-brand-gold/15 border border-brand-gold/30 px-2.5 py-1 text-xs text-brand-gold"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="text-brand-gold/60 active:text-red-400"
                aria-label={`Remove ${tag}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {/* Input for new tag */}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addTag(input);
          }
        }}
        onBlur={() => { if (input.trim()) addTag(input); }}
        placeholder="Add tag..."
        className="w-full min-w-0 rounded-lg bg-brand-darkPanel border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-brand-gold transition-colors"
      />
    </div>
  );
}

function RichtextPlaceholder({ field, value, onChange }: FieldEditorProps) {
  return (
    <div>
      <FieldLabel field={field} />
      <textarea
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Rich text (plain text mode on mobile)"
        rows={6}
        className="w-full min-w-0 rounded-lg bg-brand-darkPanel border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-brand-gold transition-colors resize-y"
      />
      <p className="text-[10px] text-white/30 mt-1">Full rich text editor coming soon</p>
    </div>
  );
}

function UnsupportedField({ field }: { field: FieldConfig }) {
  return (
    <div className="rounded-lg bg-brand-darkPanel border border-white/10 px-3 py-3">
      <p className="text-xs text-white/30">
        {field.label} — <span className="italic">{field.type}</span> (desktop only)
      </p>
    </div>
  );
}

// ─── Field Editor Dispatch ───────────────────────────

interface FieldEditorProps {
  field: FieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
}

const FIELD_EDITORS: Record<string, React.FC<FieldEditorProps>> = {
  text: TextField,
  textarea: TextareaField,
  number: NumberField,
  boolean: BooleanField,
  date: DateField,
  select: SelectField,
  tags: TagsField,
  richtext: RichtextPlaceholder,
};

function FieldEditor({ field, value, onChange }: FieldEditorProps) {
  const Editor = FIELD_EDITORS[field.type];
  if (!Editor) return <UnsupportedField field={field} />;
  return <Editor field={field} value={value} onChange={onChange} />;
}

// ─── Document Editor Screen ──────────────────────────

export function DocumentEditor() {
  const [, params] = useRoute<{
    orgId: string;
    siteId: string;
    collection: string;
    slug: string;
  }>("/site/:orgId/:siteId/edit/:collection/:slug");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<Record<string, unknown> | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<"ok" | "error" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const collectionsQuery = useQuery({
    queryKey: ["collections", params?.orgId, params?.siteId],
    queryFn: () => getCollections(params!.orgId, params!.siteId),
    enabled: !!params,
  });

  const docQuery = useQuery({
    queryKey: ["document", params?.orgId, params?.siteId, params?.collection, params?.slug],
    queryFn: () => getDocument(params!.orgId, params!.siteId, params!.collection, params!.slug),
    enabled: !!params,
  });

  const colConfig = collectionsQuery.data?.collections.find(
    (c) => c.name === params?.collection,
  );

  // Initialize form data from loaded document
  useEffect(() => {
    if (docQuery.data && !formData) {
      setFormData({ ...docQuery.data.data });
    }
  }, [docQuery.data, formData]);

  // Filter out internal fields
  const editableFields = useMemo(() => {
    if (!colConfig) return [];
    return colConfig.fields.filter((f) => !f.name.startsWith("_"));
  }, [colConfig]);

  const goBack = useCallback(() => {
    setLocation(
      `/site/${params?.orgId}/${params?.siteId}/collections/${params?.collection}`,
    );
  }, [setLocation, params]);

  function updateField(name: string, value: unknown) {
    setFormData((prev) => (prev ? { ...prev, [name]: value } : prev));
    setDirty(true);
    setSaveResult(null);
  }

  async function handleSave(newStatus?: string) {
    if (!params || !formData || saving) return;
    setSaving(true);
    setSaveResult(null);
    try {
      await saveDocument(params.orgId, params.siteId, params.collection, params.slug, {
        data: formData,
        ...(newStatus ? { status: newStatus } : {}),
      });
      setDirty(false);
      setSaveResult("ok");
      // Invalidate queries so lists update
      await queryClient.invalidateQueries({
        queryKey: ["documents", params.orgId, params.siteId, params.collection],
      });
      await queryClient.invalidateQueries({
        queryKey: ["document", params.orgId, params.siteId, params.collection, params.slug],
      });
      // Clear save feedback after 2s
      setTimeout(() => setSaveResult(null), 2000);
    } catch (err) {
      console.error("Save failed:", err);
      setSaveResult("error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!params || deleting) return;
    setDeleting(true);
    try {
      await deleteDocument(params.orgId, params.siteId, params.collection, params.slug);
      await queryClient.invalidateQueries({
        queryKey: ["documents", params.orgId, params.siteId, params.collection],
      });
      await queryClient.invalidateQueries({
        queryKey: ["collections", params.orgId, params.siteId],
      });
      goBack();
    } catch (err) {
      console.error("Delete failed:", err);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  if (!params) {
    setLocation("/home");
    return null;
  }

  const isLoading = docQuery.isLoading || collectionsQuery.isLoading;
  const doc = docQuery.data;
  const currentStatus = doc?.status ?? "draft";

  if (isLoading || !formData) {
    return (
      <Screen>
        <ScreenHeader left={<BackButton onClick={goBack} />} title="Loading..." subtitle={colConfig?.label} />
        <div className="flex flex-1 items-center justify-center"><Spinner /></div>
      </Screen>
    );
  }

  const title = (formData.title as string) || (formData.name as string) || params.slug;

  return (
    <Screen>
      <ScreenHeader
        left={<BackButton onClick={goBack} />}
        title={title}
        subtitle={colConfig?.label ?? params.collection}
        right={
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            currentStatus === "published" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
          }`}>
            {currentStatus}
          </span>
        }
      />

      <div className="flex-1 flex flex-col gap-4 px-6 pb-6 overflow-y-auto" style={{ overflowX: "hidden" }}>
        {/* Field editors */}
        {editableFields.map((field) => (
          <FieldEditor
            key={field.name}
            field={field}
            value={formData[field.name]}
            onChange={(v) => updateField(field.name, v)}
          />
        ))}

        {/* Spacer before sticky actions */}
        <div className="h-2" />
      </div>

      {/* Bottom action bar — sticky */}
      <div className="shrink-0 border-t border-white/10 bg-brand-dark px-6 py-3 safe-bottom">
        <div className="flex items-center gap-2">
          {/* Save */}
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving || !dirty}
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-medium transition-all active:scale-95 ${
              saveResult === "ok"
                ? "bg-green-500/20 text-green-400 border border-green-500/30"
                : saveResult === "error"
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : dirty
                    ? "bg-brand-gold text-brand-dark"
                    : "bg-white/10 text-white/40"
            }`}
          >
            {saving ? "Saving..." : saveResult === "ok" ? "Saved" : saveResult === "error" ? "Failed" : "Save"}
          </button>

          {/* Publish / Unpublish */}
          {currentStatus === "draft" ? (
            <button
              type="button"
              onClick={() => handleSave("published")}
              disabled={saving}
              className="rounded-xl bg-green-600 px-4 py-3 text-sm font-medium text-white active:scale-95 transition-transform disabled:opacity-50"
            >
              Publish
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSave("draft")}
              disabled={saving}
              className="rounded-xl bg-white/10 px-4 py-3 text-sm font-medium text-white/70 active:scale-95 transition-transform disabled:opacity-50"
            >
              Unpublish
            </button>
          )}

          {/* Delete */}
          {confirmDelete ? (
            <span className="flex items-center gap-1 shrink-0">
              <span style={{ fontSize: "0.65rem", color: "var(--destructive, #ef4444)", fontWeight: 500, padding: "0 2px" }}>
                Remove?
              </span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                  border: "none", background: "var(--destructive, #ef4444)", color: "#fff",
                  cursor: "pointer", lineHeight: 1, opacity: deleting ? 0.5 : 1,
                }}
              >
                {deleting ? "..." : "Yes"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{
                  fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                  border: "1px solid rgba(255,255,255,0.15)", background: "transparent",
                  color: "#fff", cursor: "pointer", lineHeight: 1,
                }}
              >
                No
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded-xl bg-white/5 p-3 text-white/40 active:scale-95 active:text-red-400 transition-all"
              aria-label="Delete"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4v8a1 1 0 001 1h4a1 1 0 001-1V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </Screen>
  );
}
