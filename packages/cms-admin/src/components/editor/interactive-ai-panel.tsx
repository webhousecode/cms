"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Sparkles, Send, Copy, Check, Replace, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  interactiveId: string;
  title: string;
  content: string;
  onApply: (newContent: string) => void;
}

/**
 * AI Edit panel for Interactives — chat-based editing of HTML/JS/CSS.
 * AI sees the current code and responds with improved versions.
 */
export function InteractiveAIPanel({ interactiveId, title, content, onApply }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [systemPromptTemplate, setSystemPromptTemplate] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Fetch the editable system prompt from server
  useEffect(() => {
    fetch("/api/cms/ai/prompts")
      .then((r) => r.json())
      .then((data: { prompts: Array<{ id: string; value: string }> }) => {
        const p = data.prompts.find((pp) => pp.id === "interactives.edit");
        if (p) setSystemPromptTemplate(p.value);
      })
      .catch(() => { /* use fallback */ });
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

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/cms/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          message: text,
          purpose: "interactives",
          systemPrompt: (systemPromptTemplate ?? "")
            .replace("{title}", title)
            .replace("{interactiveId}", interactiveId),
          context: `Current HTML content of the interactive:\n\`\`\`html\n${content}\n\`\`\``,
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

  /** Extract HTML from code fences in the message — handles various fence formats.
   *  Returns null if the HTML appears truncated (missing closing tags). */
  function extractHtml(text: string): string | null {
    let html: string | null = null;

    // Try ```html ... ``` first (complete fences)
    const fenced = text.match(/```(?:html)?\s*\n([\s\S]*?)```/);
    if (fenced) {
      html = fenced[1].trim();
    } else {
      // If the entire response looks like HTML (starts with < or <!), use it directly
      const trimmed = text.trim();
      if (trimmed.startsWith("<!") || trimmed.startsWith("<html") || trimmed.startsWith("<div") || trimmed.startsWith("<style") || trimmed.startsWith("<head") || trimmed.startsWith("<body")) {
        html = trimmed;
      }
    }

    if (!html) return null;

    // Safety check: reject truncated HTML — must end with </html> or </script> or </body> or similar closing tag
    // This prevents applying broken code that was cut off by token limits
    if (html.includes("<html") && !html.includes("</html>")) return null;
    if (html.includes("<body") && !html.includes("</body>")) return null;

    return html;
  }

  async function copyMessage(text: string, idx: number) {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  function applyHtml(text: string) {
    const html = extractHtml(text);
    if (html) onApply(html);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--background)" }}>
      {/* Header */}
      <div style={{
        padding: "0.625rem 0.875rem",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: "0.5rem",
      }}>
        <Sparkles style={{ width: "0.875rem", height: "0.875rem", color: "var(--primary)" }} />
        <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>AI Edit</span>
        <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginLeft: "auto" }}>
          Chat with AI to modify this interactive
        </span>
      </div>

      {/* Token size warning for large interactives */}
      {content.length > 12000 && messages.length === 0 && (
        <div style={{ padding: "0.5rem 0.75rem", display: "flex", alignItems: "center", gap: "0.375rem", background: "rgba(234,179,8,0.08)", borderBottom: "1px solid rgba(234,179,8,0.2)", fontSize: "0.7rem", color: "#eab308" }}>
          <AlertTriangle style={{ width: "0.75rem", height: "0.75rem", flexShrink: 0 }} />
          <span>This interactive is large ({Math.round(content.length / 1024)} KB). If AI output gets truncated, increase Max Tokens in Settings → AI.</span>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflow: "auto", padding: "0.75rem" }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "2rem 1rem", color: "var(--muted-foreground)" }}>
            <Sparkles style={{ width: "1.5rem", height: "1.5rem", margin: "0 auto 0.75rem", opacity: 0.4 }} />
            <p style={{ fontSize: "0.8rem", margin: "0 0 0.5rem" }}>Describe what you want to change</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", maxWidth: "260px", margin: "0 auto" }}>
              {["Add a smooth fade-in animation", "Make it responsive for mobile", "Change the color scheme to dark blue", "Add a hover tooltip on data points"].map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                  style={{
                    fontSize: "0.7rem", padding: "0.4rem 0.625rem", borderRadius: "6px",
                    border: "1px solid var(--border)", background: "var(--card)",
                    color: "var(--muted-foreground)", cursor: "pointer", textAlign: "left",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              marginBottom: "0.75rem",
              padding: "0.625rem 0.75rem",
              borderRadius: "8px",
              background: msg.role === "user" ? "var(--primary)" : "var(--card)",
              color: msg.role === "user" ? "var(--primary-foreground)" : "var(--foreground)",
              fontSize: "0.8rem",
              lineHeight: 1.6,
              border: msg.role === "assistant" ? "1px solid var(--border)" : "none",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxWidth: msg.role === "user" ? "85%" : "100%",
              marginLeft: msg.role === "user" ? "auto" : 0,
            }}
          >
            {msg.content || (streaming && i === messages.length - 1 ? "Thinking…" : "")}

            {/* Action buttons for assistant messages with HTML */}
            {msg.role === "assistant" && msg.content && !streaming && (() => {
              const html = extractHtml(msg.content);
              const hasHtmlBlock = /```(?:html)?\s*\n/.test(msg.content) || msg.content.trim().startsWith("<!");
              const isTruncated = hasHtmlBlock && !html;
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", marginTop: "0.5rem" }}>
                  {isTruncated && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 0.625rem", borderRadius: "6px", background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.3)", fontSize: "0.7rem", color: "#eab308" }}>
                      <AlertTriangle style={{ width: "0.75rem", height: "0.75rem", flexShrink: 0 }} />
                      Output was truncated — the HTML is incomplete. Try asking AI to make only the specific change instead of rewriting everything.
                    </div>
                  )}
                  <div style={{ display: "flex", gap: "0.375rem", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => copyMessage(msg.content, i)}
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", padding: "0.25rem 0.5rem", borderRadius: "5px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.65rem", cursor: "pointer" }}
                    >
                      {copiedIdx === i ? <><Check style={{ width: "0.6rem", height: "0.6rem" }} /> Copied</> : <><Copy style={{ width: "0.6rem", height: "0.6rem" }} /> Copy</>}
                    </button>
                    {html && (
                      <button
                        onClick={() => applyHtml(msg.content)}
                        style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.375rem 0.75rem", borderRadius: "6px", border: "none", background: "var(--primary)", color: "var(--primary-foreground)", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}
                      >
                        <Replace style={{ width: "0.75rem", height: "0.75rem" }} /> Apply Changes
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        ))}
      </div>

      {/* Input */}
      <div style={{ padding: "0.625rem 0.75rem", borderTop: "1px solid var(--border)", display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe a change... (Enter to send)"
          rows={2}
          style={{
            flex: 1, resize: "none", padding: "0.5rem 0.75rem", borderRadius: "7px",
            border: "1px solid var(--border)", background: "var(--background)",
            color: "var(--foreground)", fontSize: "0.8rem", outline: "none",
            fontFamily: "inherit", lineHeight: 1.5,
          }}
          onFocus={(e) => { e.target.style.borderColor = "var(--primary)"; }}
          onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
        />
        <Button
          size="sm"
          onClick={send}
          disabled={!input.trim() || streaming}
          style={{ flexShrink: 0 }}
        >
          <Send style={{ width: "0.75rem", height: "0.75rem" }} />
        </Button>
      </div>
    </div>
  );
}
