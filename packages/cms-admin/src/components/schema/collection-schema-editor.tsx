"use client";

import { useState, useTransition, useRef } from "react";
import { CustomSelect } from "@/components/ui/custom-select";
import { useRouter } from "next/navigation";
import { Plus, Trash2, GripVertical, Save, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FieldConfig } from "@webhouse/cms";
import type { CollectionDef } from "@/lib/config-writer";
import { cn } from "@/lib/utils";

const FIELD_TYPES = [
  "text", "textarea", "richtext", "number", "boolean",
  "date", "select", "tags", "array", "object", "relation",
  "image", "blocks",
] as const;

function newField(): FieldConfig {
  return { name: "", type: "text" };
}

interface Props {
  collection?: CollectionDef;
  isNew?: boolean;
}

export function CollectionSchemaEditor({ collection, isNew }: Props) {
  const [name, setName] = useState(collection?.name ?? "");
  const [label, setLabel] = useState(collection?.label ?? "");
  const [urlPrefix, setUrlPrefix] = useState(collection?.urlPrefix ?? "");
  const [fields, setFields] = useState<FieldConfig[]>(collection?.fields ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function updateField(index: number, patch: Partial<FieldConfig>) {
    setFields((prev) => prev.map((f, i) => i === index ? { ...f, ...patch } : f));
  }

  function removeField(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }

  function reorderFields(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    const next = [...fields];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setFields(next);
  }

  async function save() {
    setError(null);
    if (!name.trim()) { setError("Collection name is required"); return; }
    if (fields.some((f) => !f.name.trim())) { setError("All fields must have a name"); return; }

    setSaving(true);
    const body: CollectionDef = {
      name: name.trim(),
      label: label.trim() || undefined,
      urlPrefix: urlPrefix.trim() || undefined,
      fields,
    };

    const url = isNew ? "/api/schema/collections" : `/api/schema/${collection!.name}`;
    const method = isNew ? "POST" : "PUT";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? "Save failed");
      return;
    }

    startTransition(() => {
      router.push("/admin/settings");
      router.refresh();
    });
  }

  async function deleteCollection() {
    if (!confirm(`Delete collection "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/schema/${collection!.name}`, { method: "DELETE" });
    router.push("/admin/settings");
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {/* Collection metadata */}
      <div className="space-y-4 p-6 rounded-lg border border-border bg-card">
        <h2 className="text-sm font-mono tracking-widest uppercase text-muted-foreground">Collection</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Name <span className="text-primary">*</span></Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. posts"
              className="font-mono"
              disabled={!isNew} // Can't rename existing (would break content files)
            />
            {!isNew && (
              <p className="text-xs text-muted-foreground">Name cannot be changed (would break existing content)</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Label</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Blog Posts"
            />
          </div>
          <div className="space-y-1.5">
            <Label>URL Prefix</Label>
            <Input
              value={urlPrefix}
              onChange={(e) => setUrlPrefix(e.target.value)}
              placeholder="e.g. /blog"
              className="font-mono"
            />
          </div>
        </div>
      </div>

      {/* Fields */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-mono tracking-widest uppercase text-muted-foreground">Fields</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFields((prev) => [...prev, newField()])}
            className="gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Add field
          </Button>
        </div>

        {fields.length === 0 && (
          <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">
            <p className="text-sm">No fields yet. Add your first field.</p>
          </div>
        )}

        <div className="space-y-2">
          {fields.map((field, i) => (
            <FieldRow
              key={i}
              field={field}
              index={i}
              onChange={(patch) => updateField(i, patch)}
              onRemove={() => removeField(i)}
              onReorder={(to) => reorderFields(i, to)}
            />
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        {!isNew ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={deleteCollection}
            className="text-muted-foreground hover:text-destructive gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete collection
          </Button>
        ) : <div />}

        <Button onClick={save} disabled={saving} className="gap-1.5">
          <Save className="w-3.5 h-3.5" />
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

function FieldRow({
  field,
  index,
  onChange,
  onRemove,
  onReorder,
}: {
  field: FieldConfig;
  index: number;
  onChange: (patch: Partial<FieldConfig>) => void;
  onRemove: () => void;
  onReorder: (toIndex: number) => void;
}) {
  const [dragOver, setDragOver] = useState<"above" | "below" | null>(null);
  const dragRef = useRef<number | null>(null);

  function handleDragStart(e: React.DragEvent) {
    dragRef.current = index;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    setDragOver(e.clientY < mid ? "above" : "below");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const from = Number(e.dataTransfer.getData("text/plain"));
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const insertAfter = e.clientY >= mid;
    const to = insertAfter ? index : index;
    // Calculate actual target index
    const target = from < index
      ? (insertAfter ? index : index - 1)
      : (insertAfter ? index + 1 : index);
    setDragOver(null);
    if (from !== target) onReorder(target);
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(null)}
      onDrop={handleDrop}
      onDragEnd={() => setDragOver(null)}
      className={cn(
        "flex items-start gap-2 p-3 rounded-lg border bg-secondary/30 transition-colors",
        dragOver === "above" && "border-t-2 border-t-primary border-border",
        dragOver === "below" && "border-b-2 border-b-primary border-border",
        !dragOver && "border-border",
      )}
    >
      {/* Drag handle */}
      <div className="pt-1.5 shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors">
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Fields */}
      <div className="flex-1 grid grid-cols-[1fr_140px_1fr_80px] gap-2">
        <Input
          value={field.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="field_name"
          className="font-mono text-xs h-8"
        />
        <CustomSelect
          options={FIELD_TYPES.map((t) => ({ value: t, label: t }))}
          value={field.type}
          onChange={(v) => onChange({ type: v as FieldConfig["type"] })}
          style={{ height: "2rem", fontFamily: "monospace", fontSize: "0.75rem" }}
        />
        <Input
          value={field.label ?? ""}
          onChange={(e) => onChange({ label: e.target.value || undefined })}
          placeholder="Label (optional)"
          className="text-xs h-8"
        />
        <div className="flex items-center gap-1.5">
          <label
            className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none"
            title="Required — this field must have a value before the document can be saved"
          >
            <input
              type="checkbox"
              checked={field.required ?? false}
              onChange={(e) => onChange({ required: e.target.checked || undefined })}
              className="w-4 h-4 accent-primary cursor-pointer"
            />
            req
          </label>
        </div>
      </div>

      {/* Delete */}
      <button
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive transition-colors pt-1.5 shrink-0"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
