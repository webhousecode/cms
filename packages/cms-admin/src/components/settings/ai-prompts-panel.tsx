"use client";

import { useState, useEffect } from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";

interface PromptDef {
  id: string;
  label: string;
  description: string;
  value: string;
}

export function AIPromptsPanel() {
  const [prompts, setPrompts] = useState<PromptDef[]>([]);
  const [defaults, setDefaults] = useState<Record<string, string>>({});
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

  async function handleSave() {
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
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      /* ignore */
    }
    setSaving(false);
  }

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
        <h2 className="text-base font-semibold text-foreground">AI Prompts</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
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
            <button
              type="button"
              onClick={() => resetPrompt(p.id)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border"
              title="Reset to default"
            >
              <RotateCcw style={{ width: "0.65rem", height: "0.65rem" }} />
              Reset
            </button>
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

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        {saving ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Save className="w-4 h-4" />
        )}
        {saved ? "Saved!" : saving ? "Saving…" : "Save prompts"}
      </button>
    </div>
  );
}
