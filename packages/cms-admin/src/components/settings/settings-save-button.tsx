"use client";

import { useState, useEffect } from "react";
import { Save, Loader2 } from "lucide-react";

/**
 * Save button for Settings ActionBar.
 *
 * States:
 * - Clean (no changes): dimmed gold, disabled feel
 * - Dirty (unsaved changes): full gold, active
 * - Saving: spinner + "Saving..."
 *
 * Events:
 * - Listens: "cms:settings-dirty" → mark as dirty
 * - Listens: "cms:settings-saved" → mark as clean
 * - Dispatches: "cms:settings-save" → panels save their forms
 */
export function SettingsSaveButton() {
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    function onDirty() { setDirty(true); }
    function onSaved() { setSaving(false); setDirty(false); }
    window.addEventListener("cms:settings-dirty", onDirty);
    window.addEventListener("cms:settings-saved", onSaved);
    return () => {
      window.removeEventListener("cms:settings-dirty", onDirty);
      window.removeEventListener("cms:settings-saved", onSaved);
    };
  }, []);

  function handleSave() {
    if (!dirty && !saving) return;
    setSaving(true);
    window.dispatchEvent(new CustomEvent("cms:settings-save"));
    setTimeout(() => setSaving(false), 5000);
  }

  return (
    <button
      type="button"
      onClick={handleSave}
      disabled={saving}
      style={{
        height: "28px",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        padding: "0 0.65rem",
        borderRadius: "6px",
        fontSize: "0.75rem",
        fontWeight: 500,
        border: "none",
        cursor: saving ? "wait" : dirty ? "pointer" : "default",
        whiteSpace: "nowrap",
        lineHeight: 1,
        transition: "all 0.2s",
        background: "var(--primary)",
        color: "var(--primary-foreground)",
        opacity: dirty ? 1 : 0.45,
      }}
    >
      {saving
        ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
        : <Save style={{ width: 14, height: 14 }} />}
      {saving ? "Saving..." : dirty ? "Unsaved" : "Save"}
    </button>
  );
}
