"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Sparkles, X, Send, Copy, Check } from "lucide-react";
import { CustomSelect } from "@/components/ui/custom-select";
import type { CollectionConfig } from "@webhouse/cms";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  collection: string;
  colConfig: CollectionConfig;
  doc: { data: Record<string, unknown>; slug: string };
  onClose: () => void;
  onInsert: (fieldName: string, content: string) => void;
}

export function AIPanel({ collection, colConfig, doc, onClose, onInsert }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [insertTarget, setInsertTarget] = useState<string>("");
  const [copied, setCopied] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fieldMeta = (doc.data["_fieldMeta"] as Record<string, unknown> | undefined) ?? {};
  const richTextFields = colConfig.fields
    .filter((f) => (f.type === "richtext" || f.type === "text" || f.type === "textarea") && !fieldMeta[f.name])
    .map((f) => {
      const raw = f.label ?? f.name;
      const label = raw.charAt(0).toUpperCase() + raw.slice(1);
      return { name: f.name, label };
    });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
    // Set default insert target
    if (richTextFields.length > 0 && !insertTarget) {
      setInsertTarget(richTextFields[0]?.name ?? "");
    }
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setStreaming(true);

    abortRef.current = new AbortController();
    let assistantContent = "";

    // Add placeholder assistant message
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/cms/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          message: text,
          docData: doc.data,
          collectionName: colConfig.label ?? collection,
          fields: colConfig.fields.map((f) => ({
            name: f.name,
            type: f.type,
            label: f.label,
          })),
        }),
      });

      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({ error: "AI error" }))) as { error?: string };
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last) last.content = `Error: ${err.error ?? "Unknown error"}`;
          return next;
        });
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantContent += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last) last.content = assistantContent;
          return next;
        });
      }
    } catch (err) {
      if ((err as { name?: string }).name !== "AbortError") {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && !last.content) last.content = "Network error";
          return next;
        });
      }
    }

    setStreaming(false);
    abortRef.current = null;
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function copyMessage(content: string, idx: number) {
    await navigator.clipboard.writeText(content);
    setCopied(idx);
    setTimeout(() => setCopied(null), 1500);
  }

  function cleanAIContent(raw: string): string {
    const lines = raw.split("\n");

    // Only strip known AI metadata patterns — never strip user-requested content
    // These patterns are AI scaffold, not real content:
    while (lines.length > 0) {
      const l = lines[0].trim();
      if (l === "") { lines.shift(); continue; }
      if (l === "---") { lines.shift(); continue; }
      if (/^\*\*Field:\*\*/i.test(l)) { lines.shift(); continue; }
      // Preamble sentences (AI explaining what it's about to output)
      if (/^(Here is|The content below|Below is|The following|Ready for|Content for)/i.test(l) && l.endsWith(":")) { lines.shift(); continue; }
      break;
    }

    // Strip trailing AI commentary
    while (lines.length > 0) {
      const l = lines[lines.length - 1].trim();
      if (l === "") { lines.pop(); continue; }
      if (l === "---") { lines.pop(); continue; }
      // Trailing suggestions in italics: *Feel free to adjust...*
      if (/^\*[^*]+\*$/.test(l)) { lines.pop(); continue; }
      if (/^(Feel free|Adjust|Let me know|Would you like|I can also)/i.test(l)) { lines.pop(); continue; }
      break;
    }

    return lines.join("\n").trim();
  }

  function insertMessage(content: string) {
    if (!insertTarget) return;
    onInsert(insertTarget, cleanAIContent(content));
  }

  return (
    <div style={{
      position: "fixed",
      top: 0,
      right: 0,
      bottom: 0,
      width: "380px",
      zIndex: 100,
      background: "var(--card)",
      borderLeft: "1px solid var(--border)",
      boxShadow: "-4px 0 20px rgba(0,0,0,0.3)",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.75rem 1rem",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Sparkles style={{ width: "1rem", height: "1rem", color: "var(--primary)" }} />
          <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>AI Assistant</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "0.25rem" }}
        >
          <X style={{ width: "1rem", height: "1rem" }} />
        </button>
      </div>

      {/* Insert target selector */}
      {richTextFields.length > 0 && (
        <div style={{
          padding: "0.5rem 1rem",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          flexShrink: 0,
          background: "var(--muted)/20",
        }}>
          <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", fontFamily: "monospace", flexShrink: 0 }}>Insert into</span>
          <CustomSelect
            options={richTextFields.map((f) => ({ value: f.name, label: f.label }))}
            value={insertTarget}
            onChange={setInsertTarget}
            direction="auto"
            style={{ flex: 1 }}
          />
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0.75rem 1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {messages.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
            <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", margin: 0 }}>
              Ask me to generate, rewrite, or improve content for this document.
            </p>

            {/* Generate new version — primary action */}
            <button
              type="button"
              onClick={() => {
                const prompt = `Generate a completely new version of this document. Use the existing title and topic as a guide, but write fresh content with a new structure and angle. Return only the content for the "${insertTarget || richTextFields[0]?.name || "content"}" field.`;
                setInput(prompt);
                setTimeout(() => {
                  setInput("");
                  const newMessages: Message[] = [{ role: "user", content: prompt }];
                  setMessages(newMessages);
                  setStreaming(true);
                  const ctrl = new AbortController();
                  abortRef.current = ctrl;
                  let out = "";
                  setMessages(prev => [...prev, { role: "assistant", content: "" }]);
                  fetch("/api/cms/ai/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    signal: ctrl.signal,
                    body: JSON.stringify({
                      message: prompt,
                      docData: doc.data,
                      collectionName: colConfig.label ?? collection,
                      fields: colConfig.fields.map(f => ({ name: f.name, type: f.type, label: f.label })),
                    }),
                  }).then(async res => {
                    if (!res.ok || !res.body) { setStreaming(false); return; }
                    const reader = res.body.getReader();
                    const dec = new TextDecoder();
                    while (true) {
                      const { done, value } = await reader.read();
                      if (done) break;
                      out += dec.decode(value, { stream: true });
                      setMessages(prev => { const n = [...prev]; const last = n[n.length - 1]; if (last) last.content = out; return n; });
                    }
                    setStreaming(false);
                    abortRef.current = null;
                  }).catch(() => setStreaming(false));
                }, 0);
              }}
              style={{
                padding: "0.5rem 0.75rem",
                borderRadius: "8px",
                border: "1px solid color-mix(in oklch, var(--primary) 40%, transparent)",
                background: "color-mix(in oklch, var(--primary) 8%, transparent)",
                color: "var(--primary)",
                fontSize: "0.8rem",
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontWeight: 500,
                transition: "background 100ms",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "color-mix(in oklch, var(--primary) 15%, transparent)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "color-mix(in oklch, var(--primary) 8%, transparent)"; }}
            >
              <Sparkles style={{ width: "0.875rem", height: "0.875rem", flexShrink: 0 }} />
              Generate a new version
            </button>

            <div style={{ height: "1px", background: "var(--border)", margin: "0.125rem 0" }} />

            {[
              "Write an introduction paragraph",
              "Generate a summary of this article",
              "Make the title more engaging",
            ].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                style={{
                  padding: "0.4rem 0.625rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--foreground)",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 100ms",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--accent)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
            alignItems: msg.role === "user" ? "flex-end" : "flex-start",
          }}>
            <div style={{
              maxWidth: "90%",
              padding: "0.5rem 0.75rem",
              borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
              background: msg.role === "user" ? "var(--primary)" : "var(--muted)",
              color: msg.role === "user" ? "var(--primary-foreground)" : "var(--foreground)",
              fontSize: "0.8rem",
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}>
              {msg.content || (streaming && idx === messages.length - 1 ? "▋" : "")}
            </div>

            {msg.role === "assistant" && msg.content && (
              <div style={{ display: "flex", gap: "0.375rem", paddingLeft: "0.25rem" }}>
                <button
                  type="button"
                  onClick={() => copyMessage(msg.content, idx)}
                  title="Copy"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    padding: "0.2rem 0.4rem",
                    borderRadius: "4px",
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--muted-foreground)",
                    fontSize: "0.65rem",
                    cursor: "pointer",
                  }}
                >
                  {copied === idx ? <Check style={{ width: "0.65rem", height: "0.65rem" }} /> : <Copy style={{ width: "0.65rem", height: "0.65rem" }} />}
                  {copied === idx ? "Copied" : "Copy"}
                </button>
                {insertTarget && (
                  <button
                    type="button"
                    onClick={() => insertMessage(msg.content)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      padding: "0.2rem 0.4rem",
                      borderRadius: "4px",
                      border: "1px solid var(--border)",
                      background: "var(--primary)",
                      color: "var(--primary-foreground)",
                      fontSize: "0.65rem",
                      cursor: "pointer",
                    }}
                  >
                    Insert
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{
        padding: "0.75rem",
        borderTop: "1px solid var(--border)",
        display: "flex",
        gap: "0.5rem",
        alignItems: "flex-end",
        flexShrink: 0,
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask AI to help with content… (Enter to send)"
          rows={2}
          style={{
            flex: 1,
            padding: "0.5rem 0.625rem",
            borderRadius: "7px",
            border: "1px solid var(--border)",
            background: "var(--background)",
            color: "var(--foreground)",
            fontSize: "0.8rem",
            resize: "none",
            outline: "none",
            lineHeight: 1.4,
            fontFamily: "inherit",
          }}
          onFocus={(e) => { e.target.style.borderColor = "var(--primary)"; }}
          onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
        />
        <button
          type="button"
          onClick={send}
          disabled={!input.trim() || streaming}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "36px",
            height: "36px",
            borderRadius: "7px",
            border: "none",
            background: !input.trim() || streaming ? "var(--muted)" : "var(--primary)",
            color: !input.trim() || streaming ? "var(--muted-foreground)" : "var(--primary-foreground)",
            cursor: !input.trim() || streaming ? "not-allowed" : "pointer",
            flexShrink: 0,
            transition: "background 150ms",
          }}
        >
          <Send style={{ width: "0.875rem", height: "0.875rem" }} />
        </button>
      </div>
    </div>
  );
}
