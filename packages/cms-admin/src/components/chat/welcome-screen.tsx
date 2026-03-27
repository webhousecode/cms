"use client";

import { MessageSquare, Search, FileText, BarChart3, Settings, Wrench, PenLine } from "lucide-react";

interface WelcomeScreenProps {
  siteName: string;
  onSuggestionClick: (message: string) => void;
}

const SUGGESTIONS = [
  {
    icon: BarChart3,
    label: "Site overview",
    message: "Give me an overview of my site — how many collections, documents, drafts.",
  },
  {
    icon: FileText,
    label: "Show drafts",
    message: "Show me all unpublished drafts across all collections.",
  },
  {
    icon: Search,
    label: "Search content",
    message: "Search my content for ",
  },
  {
    icon: Settings,
    label: "Site info",
    message: "Tell me everything about my site — collections, fields, settings, deploy config, and content stats.",
  },
  {
    icon: Wrench,
    label: "What can you do?",
    message: "List all the tools and capabilities you have — what can I ask you to do?",
  },
  {
    icon: PenLine,
    label: "Edit a page",
    message: "I want to edit the ",
  },
];

export function WelcomeScreen({ siteName, onSuggestionClick }: WelcomeScreenProps) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
        gap: "32px",
      }}
    >
      {/* Logo / Title */}
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "16px",
            backgroundColor: "var(--primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
          }}
        >
          <MessageSquare style={{ width: "28px", height: "28px", color: "var(--primary-foreground)" }} />
        </div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--foreground)", margin: 0 }}>
          Chat with your site
        </h1>
        <p style={{ fontSize: "0.875rem", color: "var(--muted-foreground)", marginTop: "8px", maxWidth: "420px" }}>
          Ask anything about <strong>{siteName}</strong>. I know your schema, content, and settings.
        </p>
      </div>

      {/* Suggestion cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "10px",
          width: "100%",
          maxWidth: "620px",
        }}
      >
        {SUGGESTIONS.map(({ icon: Icon, label, message }) => (
          <button
            key={label}
            onClick={() => onSuggestionClick(message)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "12px 14px",
              borderRadius: "10px",
              border: "1px solid var(--border)",
              backgroundColor: "var(--card)",
              cursor: "pointer",
              textAlign: "left",
              transition: "all 150ms",
              color: "var(--foreground)",
            }}
            className="hover:border-primary/50"
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--primary)";
              e.currentTarget.style.backgroundColor = "var(--muted)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.backgroundColor = "var(--card)";
            }}
          >
            <Icon style={{ width: "16px", height: "16px", color: "var(--primary)", flexShrink: 0 }} />
            <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>{label}</span>
          </button>
        ))}
      </div>

      <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", opacity: 0.5 }}>
        Press / to focus input &middot; Ctrl+Shift+C to switch to Admin
      </p>
    </div>
  );
}
