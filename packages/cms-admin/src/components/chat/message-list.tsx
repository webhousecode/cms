"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ToolCallCard } from "./tool-call-card";
import { ThinkingAnimation } from "./thinking-animation";
import { MarkdownRenderer } from "./markdown-renderer";
import { InlineForm } from "./inline-form";
import { User, Bot, Copy, Check } from "lucide-react";

export interface ToolCall {
  tool: string;
  input?: Record<string, unknown>;
  result?: string;
  status: "running" | "done" | "error";
}

export interface InlineFormField {
  name: string;
  type: "text" | "textarea" | "select" | "boolean" | "date" | "tags";
  label: string;
  value: unknown;
  options?: Array<{ label: string; value: string }>;
  required?: boolean;
}

export interface InlineFormData {
  collection: string;
  slug: string;
  title: string;
  fields: InlineFormField[];
}

export interface ChatMessageUI {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  inlineForm?: InlineFormData;
  isStreaming?: boolean;
}

interface MessageListProps {
  messages: ChatMessageUI[];
  isThinking: boolean;
}

function MessageCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);
  return (
    <button
      onClick={handleCopy}
      title="Copy response"
      style={{
        marginTop: "8px",
        background: "none",
        border: "1px solid var(--border)",
        borderRadius: "5px",
        padding: "3px 8px",
        cursor: "pointer",
        color: copied ? "rgb(74 222 128)" : "var(--muted-foreground)",
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "0.65rem",
        opacity: copied ? 1 : 0.5,
        transition: "all 150ms",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
      onMouseLeave={(e) => { if (!copied) e.currentTarget.style.opacity = "0.5"; }}
    >
      {copied ? <Check style={{ width: "11px", height: "11px" }} /> : <Copy style={{ width: "11px", height: "11px" }} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function MessageBubble({ message }: { message: ChatMessageUI }) {
  const isUser = message.role === "user";

  return (
    <div
      style={{
        display: "flex",
        gap: "12px",
        padding: "16px 0",
        alignItems: "flex-start",
      }}
    >
      {/* Avatar — aligned with first content element (tool card or text) */}
      <div
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: isUser ? "-2px" : "2px",
          backgroundColor: isUser ? "var(--primary)" : "var(--muted)",
          color: isUser ? "var(--primary-foreground)" : "var(--foreground)",
        }}
      >
        {isUser ? (
          <User style={{ width: "14px", height: "14px" }} />
        ) : (
          <Bot style={{ width: "14px", height: "14px" }} />
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, fontSize: "0.875rem", lineHeight: 1.7, color: "var(--foreground)" }}>
        {/* Tool calls */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div style={{ marginBottom: "10px" }}>
            {message.toolCalls.map((tc, i) => (
              <ToolCallCard key={i} tool={tc.tool} input={tc.input} result={tc.result} status={tc.status} />
            ))}
          </div>
        )}

        {/* Rendered markdown content */}
        {isUser ? (
          <div style={{ fontWeight: 500 }}>{message.content}</div>
        ) : (
          <div style={{ position: "relative" }}>
            <MarkdownRenderer text={message.content} />
            {message.content && !message.isStreaming && (
              <MessageCopyButton text={message.content} />
            )}
          </div>
        )}

        {/* Inline form (Phase 3) */}
        {!isUser && message.inlineForm && (
          <InlineForm form={message.inlineForm} />
        )}

        {/* Streaming cursor */}
        {message.isStreaming && (
          <span
            style={{
              display: "inline-block",
              width: "2px",
              height: "1em",
              backgroundColor: "var(--primary)",
              marginLeft: "1px",
              animation: "chat-cursor-blink 1s step-end infinite",
              verticalAlign: "text-bottom",
            }}
          />
        )}
      </div>
    </div>
  );
}

export function MessageList({ messages, isThinking }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
      }}
    >
      <style>{`
        @keyframes chat-cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>

      <div style={{ maxWidth: "768px", margin: "0 auto", padding: "0 16px" }}>
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isThinking && (
          <div style={{ display: "flex", gap: "12px", padding: "16px 0", alignItems: "center" }}>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                backgroundColor: "var(--muted)",
                color: "var(--foreground)",
              }}
            >
              <Bot style={{ width: "14px", height: "14px" }} />
            </div>
            <ThinkingAnimation label="Thinking..." />
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
