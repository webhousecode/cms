"use client";

import { useEffect, useRef } from "react";
import { ToolCallCard } from "./tool-call-card";
import { ThinkingAnimation } from "./thinking-animation";
import { MarkdownRenderer } from "./markdown-renderer";
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
          <div>
            <MarkdownRenderer text={message.content} />
          </div>
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
