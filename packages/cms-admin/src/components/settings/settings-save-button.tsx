"use client";

import { useState, useEffect } from "react";
import { Save, Loader2 } from "lucide-react";
import { ActionButton } from "@/components/action-bar";

/**
 * Save button for Settings ActionBar.
 * Dispatches "cms:settings-save" event. Each panel listens and saves.
 * Panels dispatch "cms:settings-saved" when done.
 */
export function SettingsSaveButton() {
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onSaved() { setSaving(false); }
    window.addEventListener("cms:settings-saved", onSaved);
    return () => window.removeEventListener("cms:settings-saved", onSaved);
  }, []);

  function handleSave() {
    setSaving(true);
    window.dispatchEvent(new CustomEvent("cms:settings-save"));
    // Timeout fallback in case panel doesn't respond
    setTimeout(() => setSaving(false), 5000);
  }

  return (
    <ActionButton
      variant="primary"
      onClick={handleSave}
      disabled={saving}
      icon={saving ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <Save style={{ width: 14, height: 14 }} />}
    >
      {saving ? "Saving..." : "Save"}
    </ActionButton>
  );
}
