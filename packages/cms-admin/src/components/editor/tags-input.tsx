"use client";

import { useState, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string[];
  onChange: (tags: unknown) => void;
  disabled?: boolean;
}

export function TagsInput({ value, onChange, disabled }: Props) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addTag(tag: string) {
    const trimmed = tag.trim().toLowerCase().replace(/\s+/g, "-");
    if (!trimmed || value.includes(trimmed)) return;
    onChange([...value, trimmed]);
    setInput("");
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className={cn(
        "flex flex-wrap gap-2 p-2 rounded-md bg-input border border-border focus-within:ring-1 focus-within:ring-ring transition-colors min-h-[42px] cursor-text",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono bg-primary/10 text-primary border border-primary/20"
        >
          #{tag}
          {!disabled && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag);
              }}
              className="hover:text-foreground transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag(input);
            }
            if (e.key === "Backspace" && !input && value.length > 0) {
              removeTag(value[value.length - 1]);
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (text.includes(",")) {
              e.preventDefault();
              const tags = text.split(",").map((t) => t.trim()).filter(Boolean);
              const newTags = [...value];
              for (const tag of tags) {
                const trimmed = tag.toLowerCase().replace(/\s+/g, "-");
                if (trimmed && !newTags.includes(trimmed)) newTags.push(trimmed);
              }
              onChange(newTags);
              setInput("");
            }
          }}
          onBlur={() => {
            if (input.trim()) addTag(input);
          }}
          placeholder={value.length === 0 ? "Add tags…" : ""}
          className="flex-1 min-w-20 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      )}
    </div>
  );
}
