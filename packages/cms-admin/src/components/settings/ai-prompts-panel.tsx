"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, RotateCcw, Save, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { SectionHeading } from "@/components/ui/section-heading";

interface PromptDef {
  id: string;
  label: string;
  description: string;
  value: string;
}

export function AIPromptsPanel() {
  const [prompts, setPrompts] = useState<PromptDef[]>([]);
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/cms/ai/prompts")
      .then((r) => r.json())
      .then((data: { prompts: PromptDef[] }) => {
        setPrompts(data.prompts);
        // Store original defaults for reset
        const defs: Record<string, string> = {};
        for (const p of data.prompts) defs[p.id] = p.value;
        setDefaults(defs);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/cms/ai/prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompts: prompts.map((p) => ({ id: p.id, value: p.value })),
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { prompts: PromptDef[] };
        setPrompts(data.prompts);
        setSaved(true);
        toast.success("Prompts saved");
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      /* ignore */
    }
    setSaving(false);
    window.dispatchEvent(new CustomEvent("cms:settings-saved"));
  }, [prompts]);

  useEffect(() => {
    function onSave() { handleSave(); }
    window.addEventListener("cms:settings-save", onSave);
    return () => window.removeEventListener("cms:settings-save", onSave);
  }, [handleSave]);

  function resetPrompt(id: string) {
    // Fetch default from server
    fetch("/api/cms/ai/prompts")
      .then((r) => r.json())
      .then(() => {
        // Reset to empty = will use default on next load
        setPrompts((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, value: defaults[id] ?? p.value } : p
          )
        );
      });
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading prompts…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <SectionHeading>AI Prompts</SectionHeading>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "0.5rem" }}>
          Edit the system prompts used by all AI features. Variables in {"{braces}"} are replaced at runtime.
        </p>
      </div>

      {prompts.map((p) => (
        <div key={p.id} className="rounded-lg border border-border p-4 space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">{p.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
            </div>
            <span className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(p.value); setCopiedId(p.id); setTimeout(() => setCopiedId(null), 2000); }}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border"
                title="Copy to clipboard"
              >
                {copiedId === p.id ? <Check style={{ width: "0.65rem", height: "0.65rem", color: "#4ade80" }} /> : <Copy style={{ width: "0.65rem", height: "0.65rem" }} />}
                {copiedId === p.id ? <span style={{ color: "#4ade80" }}>Copied</span> : "Copy"}
              </button>
              {confirmResetId === p.id ? (
                <span className="flex items-center gap-1">
                  <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Reset?</span>
                  <button type="button" onClick={() => { setConfirmResetId(null); resetPrompt(p.id); }}
                    style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "none", background: "var(--destructive)", color: "#fff", cursor: "pointer", lineHeight: 1 }}>Yes</button>
                  <button type="button" onClick={() => setConfirmResetId(null)}
                    style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}>No</button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmResetId(p.id)}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border"
                  title="Reset to default"
                >
                  <RotateCcw style={{ width: "0.65rem", height: "0.65rem" }} />
                  Reset
                </button>
              )}
            </span>
          </div>
          <textarea
            value={p.value}
            onChange={(e) =>
              setPrompts((prev) =>
                prev.map((pp) =>
                  pp.id === p.id ? { ...pp, value: e.target.value } : pp
                )
              )
            }
            rows={Math.max(4, p.value.split("\n").length + 1)}
            style={{
              width: "100%",
              padding: "0.625rem",
              borderRadius: "7px",
              border: "1px solid var(--border)",
              background: "var(--background)",
              color: "var(--foreground)",
              fontSize: "0.75rem",
              fontFamily: "monospace",
              lineHeight: 1.6,
              outline: "none",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
          <p className="text-[10px] font-mono text-muted-foreground">{p.id}</p>
        </div>
      ))}

    </div>
  );
}
