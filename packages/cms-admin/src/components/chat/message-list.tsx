"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ToolCallCard } from "./tool-call-card";
import { ThinkingAnimation } from "./thinking-animation";
import { MarkdownRenderer } from "./markdown-renderer";
import { InlineForm } from "./inline-form";
import { ArtifactCard } from "./artifact-card";
import { Bot, Copy, Check } from "lucide-react";

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

export interface ArtifactData {
  title: string;
  html: string;
}

export interface ChatMessageUI {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  inlineForm?: InlineFormData;
  artifact?: ArtifactData;
  isStreaming?: boolean;
}

interface MessageListProps {
  messages: ChatMessageUI[];
  isThinking: boolean;
  thinkingText?: string;
  thinkingStartTime?: number | null;
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

const AVATAR_SIZE = 34;

function MessageBubble({ message, userAvatarUrl }: { message: ChatMessageUI; userAvatarUrl?: string | null }) {
  const isUser = message.role === "user";
  const [imgError, setImgError] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        gap: "12px",
        padding: "16px 0",
        alignItems: "flex-start",
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: `${AVATAR_SIZE}px`,
          height: `${AVATAR_SIZE}px`,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: isUser ? "-2px" : (!isUser && message.toolCalls?.length) ? "5px" : "0px",
          backgroundColor: isUser ? "var(--primary)" : "var(--muted)",
          color: isUser ? "var(--primary-foreground)" : "var(--foreground)",
          overflow: "hidden",
        }}
      >
        {isUser && userAvatarUrl && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={userAvatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setImgError(true)} />
        ) : isUser ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        ) : (
          <Bot style={{ width: "18px", height: "18px" }} />
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

        {/* Artifact (Interactive HTML) */}
        {!isUser && message.artifact && (
          <ArtifactCard title={message.artifact.title} html={message.artifact.html} />
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

export function MessageList({ messages, isThinking, thinkingText, thinkingStartTime }: MessageListProps) {
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const cached = sessionStorage.getItem("cms-session-user");
      if (cached) return (JSON.parse(cached) as { gravatarUrl?: string }).gravatarUrl ?? null;
    } catch { /* ignore */ }
    return null;
  });

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
          <MessageBubble key={msg.id} message={msg} userAvatarUrl={userAvatar} />
        ))}

        {isThinking && (
          <div style={{ padding: "16px 0" }}>
            <div
              style={{
                display: "flex",
                gap: "12px",
                alignItems: "center",
                cursor: thinkingText ? "pointer" : "default",
              }}
              onClick={() => thinkingText && setThinkingExpanded((prev) => !prev)}
            >
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
              {thinkingText && (
                <span
                  style={{
                    fontSize: "0.7rem",
                    color: "var(--muted-foreground)",
                    opacity: 0.5,
                    transition: "transform 0.15s",
                    transform: thinkingExpanded ? "rotate(90deg)" : "rotate(0deg)",
                  }}
                >
                  ▶
                </span>
              )}
              <ThinkingAnimation label="Thinking..." startTime={thinkingStartTime} />
            </div>
            {thinkingExpanded && thinkingText && (
              <div
                style={{
                  marginLeft: "40px",
                  marginTop: "8px",
                  padding: "8px 12px",
                  fontSize: "0.75rem",
                  lineHeight: 1.5,
                  color: "var(--muted-foreground)",
                  backgroundColor: "var(--muted)",
                  borderRadius: "6px",
                  whiteSpace: "pre-wrap",
                  maxHeight: "200px",
                  overflowY: "auto",
                  opacity: 0.8,
                }}
              >
                {thinkingText.trim()}
              </div>
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
