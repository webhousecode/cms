"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Send } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  visible?: boolean;
}

export function ChatInput({ onSend, disabled, placeholder, visible }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus whenever the chat becomes visible
  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [visible]);

  // Re-focus when AI finishes (disabled goes from true → false)
  useEffect(() => {
    if (!disabled && visible) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [disabled, visible]);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const h = ta.scrollHeight;
    // Only grow beyond 1 row if there's actual multi-line content
    if (value.includes("\n") || h > 40) {
      ta.style.height = Math.min(h, 200) + "px";
    }
    // Ensure scroll position is at top for single-line
    ta.scrollTop = 0;
  }, [value]);

  // Focus on "/" shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || (document.activeElement as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      textareaRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div style={{ flexShrink: 0, padding: "12px 16px 16px", borderTop: "1px solid var(--border)", backgroundColor: "var(--background)" }}>
      <style>{`.chat-textarea::placeholder { color: #888 !important; opacity: 1 !important; }`}</style>
      <div
        style={{
          maxWidth: "768px",
          margin: "0 auto",
          display: "flex",
          alignItems: "flex-end",
          gap: "8px",
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "8px 12px",
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder ?? "Type a message... (/ to focus)"}
          rows={1}
          className="chat-textarea"
          style={{
            flex: 1,
            resize: "none",
            border: "none",
            outline: "none",
            backgroundColor: "transparent",
            color: "#fafafa",
            fontSize: "0.875rem",
            lineHeight: 1.5,
            padding: "4px 0",
            fontFamily: "inherit",
            maxHeight: "200px",
            overflowY: value.includes("\n") ? "auto" : "hidden",
          }}
        />
        <button
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "8px",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: disabled || !value.trim() ? "default" : "pointer",
            backgroundColor:
              disabled || !value.trim() ? "transparent" : "var(--primary)",
            color:
              disabled || !value.trim()
                ? "var(--muted-foreground)"
                : "var(--primary-foreground)",
            transition: "all 150ms",
            flexShrink: 0,
          }}
        >
          <Send style={{ width: "16px", height: "16px" }} />
        </button>
      </div>
      <div
        style={{
          maxWidth: "768px",
          margin: "4px auto 0",
          textAlign: "center",
          fontSize: "0.65rem",
          color: "var(--muted-foreground)",
          opacity: 0.6,
        }}
      >
        Press Enter to send, Shift+Enter for new line
      </div>
    </div>
  );
}
