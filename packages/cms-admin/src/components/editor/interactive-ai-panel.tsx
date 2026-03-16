"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Sparkles, Send, Copy, Check, Replace } from "lucide-react";
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
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    textareaRef.current?.focus();
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
          systemPrompt: [
            "You are an expert web developer editing an interactive HTML component.",
            `The component is called "${title}" (ID: ${interactiveId}).`,
            "When the user asks you to modify the component, respond with the COMPLETE updated HTML.",
            "Wrap your HTML output in ```html code fences so it can be extracted.",
            "If the user asks a question (not a modification), answer concisely without code.",
            "The component is a standalone HTML document with inline <style> and <script> tags.",
            "You may use any web technology: CSS animations, Canvas, SVG, Chart.js (via CDN), D3, GSAP, etc.",
            "Always produce clean, well-structured HTML with good UX.",
          ].join("\n"),
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

  /** Extract HTML from code fences in the message */
  function extractHtml(text: string): string | null {
    const match = text.match(/```html\s*\n([\s\S]*?)```/);
    return match ? match[1].trim() : null;
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
            {msg.role === "assistant" && msg.content && !streaming && (
              <div style={{ display: "flex", gap: "0.375rem", marginTop: "0.5rem", justifyContent: "flex-end" }}>
                <button
                  onClick={() => copyMessage(msg.content, i)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", padding: "0.25rem 0.5rem", borderRadius: "5px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.65rem", cursor: "pointer" }}
                >
                  {copiedIdx === i ? <><Check style={{ width: "0.6rem", height: "0.6rem" }} /> Copied</> : <><Copy style={{ width: "0.6rem", height: "0.6rem" }} /> Copy</>}
                </button>
                {extractHtml(msg.content) && (
                  <button
                    onClick={() => applyHtml(msg.content)}
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", padding: "0.25rem 0.5rem", borderRadius: "5px", border: "none", background: "var(--primary)", color: "var(--primary-foreground)", fontSize: "0.65rem", fontWeight: 600, cursor: "pointer" }}
                  >
                    <Replace style={{ width: "0.6rem", height: "0.6rem" }} /> Apply
                  </button>
                )}
              </div>
            )}
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
