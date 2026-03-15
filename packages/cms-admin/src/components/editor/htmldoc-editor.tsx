"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { FieldConfig } from "@webhouse/cms";
import { Textarea } from "@/components/ui/textarea";
import { injectWysiwyg } from "@/lib/wysiwyg-inject";
import {
  Eye,
  Pencil,
  Sparkles,
  Code2,
  Upload,
  Maximize2,
  Minimize2,
  RotateCcw,
  Save,
  Send,
  Loader2,
  MousePointerClick,
  Check,
  X,
} from "lucide-react";

type EditMode = "preview" | "visual" | "ai" | "code";

interface Props {
  field: FieldConfig;
  value: string;
  onChange: (html: string) => void;
  locked?: boolean;
}

/* ── Mode tab pill styling ────────────────────────────────────────────── */
const TAB_CONTAINER_STYLE: React.CSSProperties = {
  display: "inline-flex",
  gap: "2px",
  padding: "3px",
  borderRadius: "8px",
  background: "var(--muted)",
};

function tabStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    padding: "4px 10px",
    borderRadius: "6px",
    border: "none",
    background: active ? "var(--card)" : "transparent",
    color: active ? "var(--foreground)" : "var(--muted-foreground)",
    fontSize: "0.75rem",
    fontWeight: active ? 500 : 400,
    cursor: "pointer",
    boxShadow: active ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
    transition: "all 150ms",
  };
}

const ICON_SIZE = { width: "13px", height: "13px" };

/* ── Empty state: upload / paste ─────────────────────────────────────── */
function EmptyState({ onChange, locked }: { onChange: (html: string) => void; locked?: boolean }) {
  const [pasteValue, setPasteValue] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onChange(reader.result);
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".html")) handleFile(file);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !locked && fileRef.current?.click()}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.5rem",
          padding: "2.5rem 1rem",
          borderRadius: "8px",
          border: `2px dashed ${dragging ? "var(--primary)" : "var(--border)"}`,
          cursor: locked ? "not-allowed" : "pointer",
          color: "var(--muted-foreground)",
          fontSize: "0.85rem",
          transition: "border-color 150ms, color 150ms",
          background: dragging ? "hsl(38 92% 50% / 0.05)" : "transparent",
        }}
      >
        <Upload style={{ width: "24px", height: "24px", opacity: 0.5 }} />
        <span>Drop an HTML file here or click to upload</span>
        <input
          ref={fileRef}
          type="file"
          accept=".html,.htm"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          disabled={locked}
          style={{ display: "none" }}
        />
      </div>

      <div style={{ color: "var(--muted-foreground)", fontSize: "0.75rem", textAlign: "center" }}>
        Or paste HTML below:
      </div>

      <Textarea
        value={pasteValue}
        onChange={(e) => setPasteValue(e.target.value)}
        placeholder="Paste HTML here..."
        disabled={locked}
        rows={6}
        className="resize-y font-mono text-xs"
        spellCheck={false}
      />

      {pasteValue.trim() && (
        <button
          type="button"
          onClick={() => onChange(pasteValue)}
          style={{
            alignSelf: "flex-start",
            padding: "0.4rem 1rem",
            borderRadius: "6px",
            border: "none",
            background: "var(--primary)",
            color: "var(--primary-foreground)",
            fontSize: "0.8rem",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Use this HTML
        </button>
      )}
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────── */
export function HtmlDocEditor({ field, value, onChange, locked }: Props) {
  const [mode, setMode] = useState<EditMode>("preview");
  const [fullscreen, setFullscreen] = useState(false);
  const [codeValue, setCodeValue] = useState(value);

  // Visual edit state
  const [wysiwygReady, setWysiwygReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [originalHtml, setOriginalHtml] = useState(value);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pendingSaveRef = useRef(false);

  // AI edit state
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPreview, setAiPreview] = useState("");
  const [aiError, setAiError] = useState("");

  // Sync codeValue when value changes externally
  useEffect(() => {
    setCodeValue(value);
  }, [value]);

  // Sync originalHtml when mode changes to visual
  useEffect(() => {
    if (mode === "visual") {
      setOriginalHtml(value);
      setWysiwygReady(false);
      setEditing(false);
      setDirty(false);
    }
  }, [mode, value]);

  // Reset AI state when switching away
  useEffect(() => {
    if (mode !== "ai") {
      setAiPreview("");
      setAiInstruction("");
      setAiError("");
    }
  }, [mode]);

  // Listen for postMessage from iframe
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!e.data) return;

      if (e.data.type === "wysiwygReady") {
        setWysiwygReady(true);
      }

      if (e.data.type === "editingActive") {
        setEditing(e.data.editing as boolean);
        if (e.data.editing) setDirty(true);
      }

      if (e.data.type === "htmlContent" && pendingSaveRef.current) {
        pendingSaveRef.current = false;
        setSaving(false);
        const html = e.data.html as string;
        onChange(html);
        setOriginalHtml(html);
        setDirty(false);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onChange]);

  const handleVisualSave = useCallback(() => {
    if (!iframeRef.current?.contentWindow) return;
    setSaving(true);
    pendingSaveRef.current = true;
    iframeRef.current.contentWindow.postMessage({ type: "getHtml" }, "*");
  }, []);

  const handleVisualReset = useCallback(() => {
    setDirty(false);
    setWysiwygReady(false);
    // Force re-render by briefly clearing
    setOriginalHtml(originalHtml);
  }, [originalHtml]);

  // AI edit handler
  async function handleAiSend() {
    if (!aiInstruction.trim() || !value) return;
    setAiLoading(true);
    setAiError("");
    setAiPreview("");

    try {
      const res = await fetch("/api/cms/ai/htmldoc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: aiInstruction, html: value }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        setAiError((data as { error?: string }).error ?? "Request failed");
        setAiLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setAiError("No response stream");
        setAiLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(chunk, { stream: true });
        setAiPreview(accumulated);
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI request failed");
    } finally {
      setAiLoading(false);
    }
  }

  function handleAiApply() {
    if (aiPreview) {
      onChange(aiPreview);
      setAiPreview("");
      setAiInstruction("");
    }
  }

  function handleAiRevert() {
    setAiPreview("");
    setAiInstruction("");
  }

  // Code mode: apply on blur
  function handleCodeBlur() {
    if (codeValue !== value) {
      onChange(codeValue);
    }
  }

  if (!value && mode === "preview") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={TAB_CONTAINER_STYLE}>
          {(["preview", "code"] as EditMode[]).map((m) => (
            <button key={m} type="button" style={tabStyle(mode === m)} onClick={() => setMode(m)}>
              {m === "preview" && <Eye style={ICON_SIZE} />}
              {m === "code" && <Code2 style={ICON_SIZE} />}
              {m === "preview" ? "Preview" : "Code"}
            </button>
          ))}
        </div>
        <EmptyState onChange={onChange} locked={locked} />
      </div>
    );
  }

  const containerStyle: React.CSSProperties = fullscreen
    ? {
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "var(--background)",
        display: "flex",
        flexDirection: "column",
        padding: "0.75rem",
        gap: "0.5rem",
      }
    : {
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      };

  const iframeSrc = mode === "visual" ? injectWysiwyg(value) : (aiPreview || value);

  return (
    <div style={containerStyle}>
      {/* Header: tabs + actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <div style={TAB_CONTAINER_STYLE}>
          {(["preview", "visual", "ai", "code"] as EditMode[]).map((m) => (
            <button
              key={m}
              type="button"
              style={tabStyle(mode === m)}
              onClick={() => setMode(m)}
              disabled={locked && (m === "visual" || m === "ai" || m === "code")}
            >
              {m === "preview" && <Eye style={ICON_SIZE} />}
              {m === "visual" && <Pencil style={ICON_SIZE} />}
              {m === "ai" && <Sparkles style={ICON_SIZE} />}
              {m === "code" && <Code2 style={ICON_SIZE} />}
              {m === "preview" ? "Preview" : m === "visual" ? "Visual Edit" : m === "ai" ? "AI Edit" : "Code"}
            </button>
          ))}
        </div>

        {/* Visual mode actions */}
        {mode === "visual" && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginLeft: "auto" }}>
            {!wysiwygReady && (
              <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.7rem", color: "var(--muted-foreground)" }}>
                <Loader2 style={{ ...ICON_SIZE, animation: "spin 1s linear infinite" }} />
                Loading...
              </span>
            )}
            {wysiwygReady && !editing && !dirty && (
              <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.7rem", color: "var(--muted-foreground)" }}>
                <MousePointerClick style={ICON_SIZE} />
                Click any text to edit
              </span>
            )}
            {dirty && (
              <>
                <button
                  type="button"
                  onClick={handleVisualReset}
                  style={{
                    display: "flex", alignItems: "center", gap: "4px",
                    padding: "3px 8px", borderRadius: "5px",
                    border: "1px solid var(--border)", background: "transparent",
                    color: "var(--muted-foreground)", fontSize: "0.7rem", cursor: "pointer",
                  }}
                >
                  <RotateCcw style={{ width: "11px", height: "11px" }} />
                  Reset
                </button>
                <button
                  type="button"
                  onClick={handleVisualSave}
                  disabled={saving}
                  style={{
                    display: "flex", alignItems: "center", gap: "4px",
                    padding: "3px 8px", borderRadius: "5px",
                    border: "none", background: "var(--primary)",
                    color: "var(--primary-foreground)", fontSize: "0.7rem",
                    fontWeight: 500, cursor: saving ? "wait" : "pointer",
                  }}
                >
                  {saving ? <Loader2 style={{ ...ICON_SIZE, animation: "spin 1s linear infinite" }} /> : <Save style={{ width: "11px", height: "11px" }} />}
                  Save
                </button>
              </>
            )}
          </div>
        )}

        {/* Fullscreen toggle (all modes) */}
        <button
          type="button"
          onClick={() => setFullscreen((f) => !f)}
          style={{
            marginLeft: mode !== "visual" ? "auto" : undefined,
            padding: "4px",
            borderRadius: "5px",
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--muted-foreground)",
            cursor: "pointer",
            display: "flex",
          }}
          title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {fullscreen ? <Minimize2 style={ICON_SIZE} /> : <Maximize2 style={ICON_SIZE} />}
        </button>
      </div>

      {/* ── Preview mode ────────────────────────────────────────────── */}
      {mode === "preview" && (
        <div
          style={{
            flex: fullscreen ? 1 : undefined,
            height: fullscreen ? undefined : "500px",
            borderRadius: "8px",
            border: "1px solid var(--border)",
            overflow: "hidden",
            background: "#fff",
          }}
        >
          <iframe
            srcDoc={value}
            sandbox="allow-scripts allow-same-origin"
            style={{ width: "100%", height: "100%", border: "none" }}
            title={`${field.label ?? field.name} preview`}
          />
        </div>
      )}

      {/* ── Visual edit mode ────────────────────────────────────────── */}
      {mode === "visual" && (
        <div
          style={{
            flex: fullscreen ? 1 : undefined,
            height: fullscreen ? undefined : "500px",
            borderRadius: "8px",
            border: "1px solid var(--border)",
            overflow: "hidden",
            background: "#fff",
          }}
        >
          <iframe
            ref={iframeRef}
            srcDoc={injectWysiwyg(value)}
            sandbox="allow-scripts allow-same-origin"
            style={{ width: "100%", height: "100%", border: "none" }}
            title={`${field.label ?? field.name} visual editor`}
          />
        </div>
      )}

      {/* ── AI edit mode ────────────────────────────────────────────── */}
      {mode === "ai" && (
        <div
          style={{
            flex: fullscreen ? 1 : undefined,
            display: "flex",
            gap: "0.75rem",
            height: fullscreen ? undefined : "500px",
            minHeight: "400px",
          }}
        >
          {/* Left: iframe preview */}
          <div
            style={{
              flex: "3 1 0",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              overflow: "hidden",
              background: "#fff",
            }}
          >
            <iframe
              srcDoc={aiPreview || value}
              sandbox="allow-scripts allow-same-origin"
              style={{ width: "100%", height: "100%", border: "none" }}
              title={`${field.label ?? field.name} AI preview`}
            />
          </div>

          {/* Right: chat panel */}
          <div
            style={{
              flex: "2 1 0",
              display: "flex",
              flexDirection: "column",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: "var(--card)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "0.6rem 0.75rem",
                borderBottom: "1px solid var(--border)",
                fontSize: "0.75rem",
                fontWeight: 500,
                color: "var(--foreground)",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Sparkles style={{ width: "12px", height: "12px", color: "var(--primary)" }} />
              AI Edit
            </div>

            {/* Status / response area */}
            <div
              style={{
                flex: 1,
                padding: "0.75rem",
                overflowY: "auto",
                fontSize: "0.8rem",
                color: "var(--muted-foreground)",
              }}
            >
              {!aiPreview && !aiLoading && !aiError && (
                <p style={{ margin: 0 }}>
                  Describe what you want to change in the HTML document. The AI will modify it and show you a preview.
                </p>
              )}
              {aiLoading && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Loader2 style={{ width: "14px", height: "14px", animation: "spin 1s linear infinite" }} />
                  <span>Generating...</span>
                </div>
              )}
              {aiError && (
                <div style={{ color: "var(--destructive)", fontSize: "0.8rem" }}>
                  {aiError}
                </div>
              )}
              {aiPreview && !aiLoading && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--foreground)" }}>
                    <Check style={{ width: "14px", height: "14px", color: "hsl(142 76% 36%)" }} />
                    <span>Changes ready — preview updated on the left.</span>
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <button
                      type="button"
                      onClick={handleAiApply}
                      style={{
                        display: "flex", alignItems: "center", gap: "4px",
                        padding: "4px 10px", borderRadius: "5px",
                        border: "none", background: "var(--primary)",
                        color: "var(--primary-foreground)", fontSize: "0.75rem",
                        fontWeight: 500, cursor: "pointer",
                      }}
                    >
                      <Check style={{ width: "12px", height: "12px" }} />
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={handleAiRevert}
                      style={{
                        display: "flex", alignItems: "center", gap: "4px",
                        padding: "4px 10px", borderRadius: "5px",
                        border: "1px solid var(--border)", background: "transparent",
                        color: "var(--muted-foreground)", fontSize: "0.75rem",
                        cursor: "pointer",
                      }}
                    >
                      <X style={{ width: "12px", height: "12px" }} />
                      Revert
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Input area */}
            <div
              style={{
                padding: "0.5rem 0.75rem",
                borderTop: "1px solid var(--border)",
                display: "flex",
                gap: "0.4rem",
              }}
            >
              <textarea
                value={aiInstruction}
                onChange={(e) => setAiInstruction(e.target.value)}
                placeholder="e.g. Make the hero section use a dark blue gradient..."
                disabled={locked || aiLoading}
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAiSend();
                  }
                }}
                style={{
                  flex: 1,
                  padding: "0.4rem 0.6rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  background: "var(--background)",
                  color: "var(--foreground)",
                  fontSize: "0.8rem",
                  resize: "none",
                  fontFamily: "inherit",
                }}
              />
              <button
                type="button"
                onClick={handleAiSend}
                disabled={!aiInstruction.trim() || aiLoading || locked}
                style={{
                  alignSelf: "flex-end",
                  padding: "6px",
                  borderRadius: "6px",
                  border: "none",
                  background: aiInstruction.trim() && !aiLoading ? "var(--primary)" : "var(--muted)",
                  color: aiInstruction.trim() && !aiLoading ? "var(--primary-foreground)" : "var(--muted-foreground)",
                  cursor: aiInstruction.trim() && !aiLoading ? "pointer" : "not-allowed",
                  display: "flex",
                }}
              >
                <Send style={{ width: "14px", height: "14px" }} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Code mode ───────────────────────────────────────────────── */}
      {mode === "code" && (
        <Textarea
          value={codeValue}
          onChange={(e) => setCodeValue(e.target.value)}
          onBlur={handleCodeBlur}
          disabled={locked}
          rows={fullscreen ? 40 : 20}
          className="resize-y font-mono text-xs"
          spellCheck={false}
          style={{
            flex: fullscreen ? 1 : undefined,
            minHeight: fullscreen ? undefined : "300px",
            tabSize: 2,
          }}
        />
      )}

      {/* Spin animation for Loader2 */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
