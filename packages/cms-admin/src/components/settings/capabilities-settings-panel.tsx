"use client";

/**
 * F153 — Site Settings → Features. Per-tenant capability toggles.
 *
 * Lets an admin turn whole feature areas on/off for THIS site (a CMS without
 * AI, a stripped editor, …) without removing any code. Backward compatible:
 * everything defaults ON, so an untouched site behaves exactly as today.
 *
 * F153.1 ships the toggles + profiles + round-trip ONLY — the actual gates that
 * consume these (hiding nav/routes/buttons) land in F153.2. So toggling here is
 * persisted but does not yet change what's visible.
 */
import { useEffect, useState, useCallback } from "react";
import { SectionHeading } from "@/components/ui/section-heading";
import { CustomSelect } from "@/components/ui/custom-select";
import { SettingsCard } from "./settings-card";
import { Button } from "@/components/ui/button";
import {
  CAPABILITIES,
  CAPABILITY_KEYS,
  CAPABILITY_PROFILES,
  resolveCapabilities,
  capabilityProfile,
  type CapabilityMap,
  type CapabilityKey,
} from "@/lib/capabilities-shared";

const PROFILE_OPTIONS = [
  { value: "minimal", label: "Minimal — content + media only" },
  { value: "standard", label: "Standard — + SEO, forms, scheduling" },
  { value: "full", label: "Full — everything (default)" },
  { value: "custom", label: "Custom" },
];

export function CapabilitiesSettingsPanel({
  endpoint = "/api/admin/site-config",
  selfSave = false,
}: { endpoint?: string; selfSave?: boolean } = {}) {
  const [caps, setCaps] = useState<CapabilityMap>(() => resolveCapabilities({}));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function update(next: CapabilityMap) {
    setCaps(next);
    window.dispatchEvent(new CustomEvent("cms:settings-dirty"));
  }

  useEffect(() => {
    fetch(endpoint)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setCaps(resolveCapabilities(data.capabilities));
      })
      .catch(() => {});
  }, [endpoint]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capabilities: caps }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
      window.dispatchEvent(new CustomEvent("cms:settings-saved"));
    }
  }, [caps, endpoint]);

  useEffect(() => {
    function onSave() { void handleSave(); }
    window.addEventListener("cms:settings-save", onSave);
    return () => window.removeEventListener("cms:settings-save", onSave);
  }, [handleSave]);

  const profile = capabilityProfile(caps);

  function applyProfile(v: string) {
    if (v === "custom") return; // "custom" is a status, not an action
    const preset = CAPABILITY_PROFILES[v as keyof typeof CAPABILITY_PROFILES];
    if (preset) update(resolveCapabilities(preset));
  }

  function toggle(key: CapabilityKey, checked: boolean) {
    // Re-resolve so the requires-cascade stays consistent (e.g. ai off → agents/chat off).
    update(resolveCapabilities({ ...caps, [key]: checked }));
  }

  return (
    <div data-testid="capabilities-settings-panel">
      <SectionHeading>Profile</SectionHeading>
      <SettingsCard>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: "0 0 0.75rem" }}>
          Turn whole feature areas on or off for this site. Nothing is removed — disabled features
          just disappear from the editor. Pick a profile to set everything at once, then fine-tune below.
        </p>
        <CustomSelect
          value={profile}
          onChange={applyProfile}
          options={PROFILE_OPTIONS}
        />
      </SettingsCard>

      <SectionHeading>Features</SectionHeading>
      <SettingsCard>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0 }}>
            Content and Media are always on (the core). Everything else can be toggled.
          </p>
          {CAPABILITY_KEYS.map((key) => {
            const def = CAPABILITIES[key];
            const reqs = (def as { requires?: string[] }).requires ?? [];
            const blockedBy = reqs.filter((r) => !caps[r as CapabilityKey]);
            const disabled = blockedBy.length > 0;
            return (
              <div key={key} style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", opacity: disabled ? 0.5 : 1 }}>
                <input
                  data-testid={`capability-toggle-${key}`}
                  type="checkbox"
                  checked={caps[key]}
                  disabled={disabled}
                  onChange={(e) => toggle(key, e.target.checked)}
                  style={{ accentColor: "var(--primary)", marginTop: "0.2rem" }}
                />
                <div>
                  <label style={{ fontSize: "0.8rem", fontWeight: 500, display: "block" }}>
                    {def.label}
                    {disabled && (
                      <span style={{ fontSize: "0.68rem", fontWeight: 400, color: "var(--muted-foreground)", marginLeft: "0.4rem" }}>
                        (needs {blockedBy.map((r) => CAPABILITIES[r as CapabilityKey].label).join(", ")})
                      </span>
                    )}
                  </label>
                  <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0 }}>{def.description}</p>
                </div>
              </div>
            );
          })}
          {saved && (
            <p data-testid="capabilities-saved" style={{ fontSize: "0.72rem", color: "rgb(74 222 128)", margin: 0 }}>
              Saved.
            </p>
          )}
          {selfSave && (
            <Button
              data-testid="capabilities-save"
              onClick={() => void handleSave()}
              disabled={saving}
              style={{ alignSelf: "flex-start" }}
            >
              {saving ? "Saving…" : "Save features"}
            </Button>
          )}
        </div>
      </SettingsCard>
    </div>
  );
}
