"use client";

import { MessageSquare, Search, FileText, BarChart3, Settings, Wrench, PenLine } from "lucide-react";
import { useT } from "@/lib/i18n-context";

interface WelcomeScreenProps {
  siteName: string;
  onSuggestionClick: (message: string, quickKey?: string) => void;
}

// `quickKey` matches a cached quick-action (see lib/chat/quick-actions.ts) so a
// warm cache renders instantly (F158). Input-fillers (Search/Edit) have no key.
// label/message hold catalog keys, translated at render time.
const SUGGESTIONS = [
  {
    icon: BarChart3,
    label: "chat.welcomeScreen.siteOverviewLabel",
    quickKey: "overview",
    testid: "welcome-suggestion-overview",
    message: "chat.welcomeScreen.siteOverviewMessage",
  },
  {
    icon: FileText,
    label: "chat.welcomeScreen.showDraftsLabel",
    quickKey: "drafts",
    testid: "welcome-suggestion-drafts",
    message: "chat.welcomeScreen.showDraftsMessage",
  },
  {
    icon: Search,
    label: "chat.welcomeScreen.searchContentLabel",
    testid: "welcome-suggestion-search",
    message: "chat.welcomeScreen.searchContentMessage",
  },
  {
    icon: Settings,
    label: "chat.welcomeScreen.siteInfoLabel",
    quickKey: "site-info",
    testid: "welcome-suggestion-site-info",
    message: "chat.welcomeScreen.siteInfoMessage",
  },
  {
    icon: Wrench,
    label: "chat.welcomeScreen.capabilitiesLabel",
    quickKey: "capabilities",
    testid: "welcome-suggestion-capabilities",
    message: "chat.welcomeScreen.capabilitiesMessage",
  },
  {
    icon: PenLine,
    label: "chat.welcomeScreen.editPageLabel",
    testid: "welcome-suggestion-edit",
    message: "chat.welcomeScreen.editPageMessage",
  },
];

export function WelcomeScreen({ siteName, onSuggestionClick }: WelcomeScreenProps) {
  const t = useT();
  // One sentence in the catalog; split around the bold site name.
  const [subtitleBefore, subtitleAfter = ""] = t("chat.welcomeScreen.subtitle", { site: "\u0001" }).split("\u0001");
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
          {t("chat.welcomeScreen.title")}
        </h1>
        <p style={{ fontSize: "0.875rem", color: "var(--muted-foreground)", marginTop: "8px", maxWidth: "420px" }}>
          {subtitleBefore}<strong>{siteName}</strong>{subtitleAfter}
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
        {SUGGESTIONS.map(({ icon: Icon, label, message, quickKey, testid }) => (
          <button
            data-testid={testid}
            key={label}
            onClick={() => onSuggestionClick(t(message), quickKey)}
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
            <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>{t(label)}</span>
          </button>
        ))}
      </div>

      <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", opacity: 0.5 }}>
        {t("chat.welcomeScreen.shortcutHint")}
      </p>
    </div>
  );
}
