"use client";

import { useEffect, useRef } from "react";
import { ToolCallCard } from "./tool-call-card";
import { ThinkingAnimation } from "./thinking-animation";
import { User, Bot } from "lucide-react";

export interface ToolCall {
  tool: string;
  input?: Record<string, unknown>;
  result?: string;
  status: "running" | "done" | "error";
}

export interface ChatMessageUI {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
}

interface MessageListProps {
  messages: ChatMessageUI[];
  isThinking: boolean;
}

/** Simple markdown-lite renderer — handles bold, italic, code, and line breaks */
function renderContent(text: string) {
  if (!text) return null;

  // Split into paragraphs
  const paragraphs = text.split(/\n\n+/);

  return paragraphs.map((para, i) => {
    // Check if it's a list
    const lines = para.split("\n");
    const isList = lines.every((l) => l.match(/^[-*•]\s/) || l.trim() === "");

    if (isList) {
      return (
        <ul key={i} style={{ margin: "4px 0", paddingLeft: "20px", listStyleType: "disc" }}>
          {lines
            .filter((l) => l.match(/^[-*•]\s/))
            .map((l, j) => (
              <li key={j} style={{ margin: "2px 0" }}>
                <InlineText text={l.replace(/^[-*•]\s/, "")} />
              </li>
            ))}
        </ul>
      );
    }

    return (
      <p key={i} style={{ margin: i > 0 ? "8px 0 0" : "0" }}>
        {lines.map((line, j) => (
          <span key={j}>
            {j > 0 && <br />}
            <InlineText text={line} />
          </span>
        ))}
      </p>
    );
  });
}

/** Render inline formatting: bold, italic, inline code */
function InlineText({ text }: { text: string }) {
  // Very lightweight inline markdown
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return <em key={i}>{part.slice(1, -1)}</em>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              style={{
                padding: "1px 4px",
                borderRadius: "3px",
                fontSize: "0.85em",
                backgroundColor: "var(--muted)",
                fontFamily: "monospace",
              }}
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
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
      {/* Avatar */}
      <div
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
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
      <div style={{ flex: 1, minWidth: 0, fontSize: "0.875rem", lineHeight: 1.6, color: "var(--foreground)" }}>
        {/* Tool calls (shown before text for assistant) */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div style={{ marginBottom: "8px" }}>
            {message.toolCalls.map((tc, i) => (
              <ToolCallCard key={i} tool={tc.tool} input={tc.input} result={tc.result} status={tc.status} />
            ))}
          </div>
        )}

        {/* Text content */}
        <div>{renderContent(message.content)}</div>

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
        padding: "0 16px",
      }}
    >
      <style>{`
        @keyframes chat-cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>

      <div style={{ maxWidth: "768px", margin: "0 auto" }}>
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isThinking && (
          <div style={{ display: "flex", gap: "12px", padding: "16px 0", alignItems: "flex-start" }}>
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
