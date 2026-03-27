"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Send } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

export function ChatInput({ onSend, disabled, placeholder, autoFocus }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    // Reset height
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
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
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
    <div style={{ padding: "12px 16px 16px", borderTop: "1px solid var(--border)" }}>
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
          transition: "border-color 150ms",
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
          className="text-foreground placeholder:text-muted-foreground"
          style={{
            flex: 1,
            resize: "none",
            border: "none",
            outline: "none",
            backgroundColor: "transparent",
            fontSize: "0.875rem",
            lineHeight: 1.5,
            padding: "4px 0",
            fontFamily: "inherit",
            maxHeight: "200px",
            caretColor: "var(--foreground)",
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
