"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useBrand } from "@/lib/brand-context";
import { useT } from "@/lib/i18n-context";
import {
  HelpCircle, X, BookOpen, Wrench, Activity, Mail,
  MessageCircle, Keyboard, ExternalLink, Bot,
  Search, FileText, Settings, Pencil, Send, Trash2,
  BarChart3, Shield, Clock, Copy, Image, Sparkles,
  Workflow, ClipboardList, Gauge, Languages, Brain, Globe, Zap,
  CheckCircle2, XCircle, Layers,
} from "lucide-react";

const ICON_SIZE = { width: "1rem", height: "1rem" };

const HELP_LINKS = [
  { testid: "documentation", label: "shell.helpDrawer.links.documentation", icon: <BookOpen style={ICON_SIZE} />, href: "https://docs.webhouse.app" },
  { testid: "troubleshooting", label: "shell.helpDrawer.links.troubleshooting", icon: <Wrench style={ICON_SIZE} />, href: "https://docs.webhouse.app/docs/troubleshooting" },
  { testid: "system-status", label: "shell.helpDrawer.links.systemStatus", icon: <Activity style={ICON_SIZE} />, href: "https://status.webhouse.app" },
  { testid: "contact-support", label: "shell.helpDrawer.links.contactSupport", icon: <Mail style={ICON_SIZE} />, href: "mailto:cms@webhouse.dk" },
];

const SHORTCUT_GROUPS = [
  {
    label: "shell.helpDrawer.shortcutGroups.chatWithYourSite",
    shortcuts: [
      { keys: "⌃ ⇧ C", label: "shell.helpDrawer.shortcuts.toggleChatAdminMode" },
      { keys: "/", label: "shell.helpDrawer.shortcuts.focusChatInput" },
      { keys: "⌘ ⇧ N", label: "shell.helpDrawer.shortcuts.newConversation" },
    ],
  },
  {
    label: "shell.helpDrawer.shortcutGroups.general",
    shortcuts: [
      { keys: "⌘ K", label: "shell.helpDrawer.shortcuts.commandPalette" },
      { keys: "h", label: "shell.helpDrawer.shortcuts.helpSupport" },
      { keys: "p", label: "shell.helpDrawer.shortcuts.previewSite" },
      { keys: "d", label: "shell.helpDrawer.shortcuts.deploySite" },
      { keys: "t", label: "shell.helpDrawer.shortcuts.newTab" },
      { keys: "c", label: "shell.helpDrawer.shortcuts.closeTab" },
      { keys: "⌘ ⇧ ←", label: "shell.helpDrawer.shortcuts.previousTab" },
      { keys: "⌘ ⇧ →", label: "shell.helpDrawer.shortcuts.nextTab" },
    ],
  },
  {
    label: "shell.helpDrawer.shortcutGroups.documentEditor",
    shortcuts: [
      { keys: "⌘ S", label: "shell.helpDrawer.shortcuts.saveDocument" },
      { keys: "⌘ ⇧ P", label: "shell.helpDrawer.shortcuts.publish" },
    ],
  },
  {
    label: "shell.helpDrawer.shortcutGroups.collectionList",
    shortcuts: [
      { keys: "n", label: "shell.helpDrawer.shortcuts.newItem" },
      { keys: "g", label: "shell.helpDrawer.shortcuts.generateWithAi" },
    ],
  },
  {
    label: "shell.helpDrawer.shortcutGroups.richTextEditor",
    shortcuts: [
      { keys: "⌘ B", label: "shell.helpDrawer.shortcuts.bold" },
      { keys: "⌘ I", label: "shell.helpDrawer.shortcuts.italic" },
      { keys: "⌘ U", label: "shell.helpDrawer.shortcuts.underline" },
      { keys: "⌘ ⇧ X", label: "shell.helpDrawer.shortcuts.strikethrough" },
      { keys: "⌘ ⇧ 7", label: "shell.helpDrawer.shortcuts.orderedList" },
      { keys: "⌘ ⇧ 8", label: "shell.helpDrawer.shortcuts.bulletList" },
      { keys: "⌘ ⇧ B", label: "shell.helpDrawer.shortcuts.blockquote" },
      { keys: "⌘ ⇧ E", label: "shell.helpDrawer.shortcuts.codeBlock" },
    ],
  },
];

type DrawerPage = "help" | "shortcuts" | "ai-tools";

export function HelpDrawer({ open, onClose, initialPage = "help" }: { open: boolean; onClose: () => void; initialPage?: DrawerPage }) {
  const t = useT();
  const [page, setPage] = useState<DrawerPage>(initialPage);
  const brand = useBrand();
  const dot = brand.name.lastIndexOf(".");

  // Reset page when opened
  useEffect(() => { if (open) setPage(initialPage); }, [open, initialPage]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: "340px", zIndex: 9999,
      background: "var(--card)", borderLeft: "1px solid var(--border)",
      boxShadow: "-4px 0 20px rgba(0,0,0,0.3)",
      display: "flex", flexDirection: "column",
    }}>
        {/* Header with tabs */}
        <div style={{ borderBottom: "1px solid var(--border)" }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0.75rem 1.25rem 0",
          }}>
            <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{t("shell.helpDrawer.title")}</span>
            <button
              data-testid="help-close-button"
              type="button"
              onClick={onClose}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "0.25rem" }}
            >
              <X style={{ width: "1rem", height: "1rem" }} />
            </button>
          </div>
          <div style={{ display: "flex", gap: "0.25rem", padding: "0.5rem 1rem" }}>
            {([
              { id: "help" as const, label: t("shell.helpDrawer.tabHelp"), icon: <HelpCircle style={{ width: "0.8rem", height: "0.8rem" }} /> },
              { id: "shortcuts" as const, label: t("shell.helpDrawer.tabShortcuts"), icon: <Keyboard style={{ width: "0.8rem", height: "0.8rem" }} /> },
              { id: "ai-tools" as const, label: t("shell.helpDrawer.tabAiChat"), icon: <Bot style={{ width: "0.8rem", height: "0.8rem" }} /> },
            ]).map((tab) => (
              <button
                data-testid={`help-tab-${tab.id}`}
                key={tab.id}
                type="button"
                onClick={() => setPage(tab.id)}
                style={{
                  display: "flex", alignItems: "center", gap: "0.35rem",
                  padding: "0.4rem 0.75rem",
                  fontSize: "0.8rem", fontWeight: 500,
                  color: page === tab.id ? "var(--foreground)" : "var(--muted-foreground)",
                  background: page === tab.id ? "var(--accent)" : "transparent",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer", transition: "all 150ms",
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem" }}>
          {page === "help" && <HelpPage />}
          {page === "shortcuts" && <ShortcutsPage />}
          {page === "ai-tools" && <AiToolsPage />}
        </div>

        {/* Footer */}
        <div style={{
          padding: "0.75rem 1.25rem",
          borderTop: "1px solid var(--border)",
          fontSize: "0.65rem",
          color: "var(--muted-foreground)",
          fontFamily: "monospace",
        }}>
          {dot > 0 ? (
            <><span style={{ color: "#fff", fontWeight: 600 }}>{brand.name.slice(0, dot)}</span><span style={{ color: "var(--primary)" }}>{brand.name.slice(dot)}</span></>
          ) : (
            <span style={{ color: "#fff", fontWeight: 600 }}>{brand.name}</span>
          )} · v0.2.10
        </div>
    </div>,
    document.body
  );
}

/* ─── Help page ──────────────────────────────────────────────── */

function HelpPage() {
  const t = useT();
  return (
    <>
      <div style={{ marginBottom: "2rem" }}>
        <p style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>{t("shell.helpDrawer.needHelp")}</p>
        <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>{t("shell.helpDrawer.startWithDocs")}</p>

        <div style={{ borderRadius: "10px", border: "1px solid var(--border)", overflow: "hidden" }}>
          {HELP_LINKS.map((link, i) => (
            <a
              data-testid={`help-link-${link.testid}`}
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", gap: "0.75rem",
                padding: "0.75rem 1rem",
                borderTop: i > 0 ? "1px solid var(--border)" : "none",
                color: "var(--foreground)", textDecoration: "none",
                fontSize: "0.85rem", transition: "background 120ms",
              }}
              className="hover:bg-accent/50"
            >
              <span style={{ color: "var(--muted-foreground)" }}>{link.icon}</span>
              <span style={{ flex: 1 }}>{t(link.label)}</span>
              <ExternalLink style={{ width: "0.7rem", height: "0.7rem", color: "var(--muted-foreground)" }} />
            </a>
          ))}
        </div>
      </div>

      <div>
        <p style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>{t("shell.helpDrawer.community")}</p>
        <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
          {t("shell.helpDrawer.communityText")}
        </p>
        <a
          data-testid="help-discord-link"
          href="https://discord.gg/jtjnEkVX8D"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", gap: "0.5rem",
            padding: "0.6rem 1rem", borderRadius: "8px",
            background: "rgb(88 101 242)", color: "#fff",
            textDecoration: "none", fontSize: "0.85rem", fontWeight: 600,
          }}
        >
          <MessageCircle style={{ width: "1rem", height: "1rem" }} />
          {t("shell.helpDrawer.joinDiscord")}
        </a>
      </div>
    </>
  );
}

/* ─── Shortcuts page ─────────────────────────────────────────── */

function ShortcutsPage() {
  const t = useT();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {SHORTCUT_GROUPS.map((group) => (
        <div key={group.label}>
          <p style={{
            fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.08em", color: "var(--muted-foreground)",
            marginBottom: "0.75rem",
          }}>
            {t(group.label)}
          </p>
          <div style={{
            borderRadius: "10px", border: "1px solid var(--border)",
            overflow: "hidden",
          }}>
            {group.shortcuts.map((s, i) => (
              <div
                key={s.keys}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "0.6rem 1rem",
                  borderTop: i > 0 ? "1px solid var(--border)" : "none",
                }}
              >
                <span style={{ fontSize: "0.85rem" }}>{t(s.label)}</span>
                <div style={{ display: "flex", gap: "0.3rem" }}>
                  {s.keys.split(" ").map((k, j) => (
                    <kbd key={j} style={{
                      fontSize: "0.8rem", fontFamily: "monospace",
                      padding: "0.3rem 0.6rem", borderRadius: "6px",
                      border: "1px solid var(--border)",
                      background: "var(--secondary)",
                      color: "var(--foreground)",
                      minWidth: "1.75rem", minHeight: "1.75rem",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      boxShadow: "0 2px 0 var(--border)",
                      lineHeight: 1,
                    }}>{k}</kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── AI Chat Tools page ─────────────────────────────────────── */

const AI_TOOL_GROUPS = [
  {
    label: "shell.helpDrawer.toolGroups.content",
    tools: [
      { icon: BarChart3, name: "shell.helpDrawer.tools.siteOverview.name", desc: "shell.helpDrawer.tools.siteOverview.desc" },
      { icon: Search, name: "shell.helpDrawer.tools.searchContent.name", desc: "shell.helpDrawer.tools.searchContent.desc" },
      { icon: FileText, name: "shell.helpDrawer.tools.listReadDocs.name", desc: "shell.helpDrawer.tools.listReadDocs.desc" },
      { icon: Pencil, name: "shell.helpDrawer.tools.createEdit.name", desc: "shell.helpDrawer.tools.createEdit.desc" },
      { icon: Copy, name: "shell.helpDrawer.tools.cloneDocument.name", desc: "shell.helpDrawer.tools.cloneDocument.desc" },
      { icon: Sparkles, name: "shell.helpDrawer.tools.generateContent.name", desc: "shell.helpDrawer.tools.generateContent.desc" },
      { icon: Pencil, name: "shell.helpDrawer.tools.inlineEditForm.name", desc: "shell.helpDrawer.tools.inlineEditForm.desc" },
      { icon: Send, name: "shell.helpDrawer.tools.bulkPublish.name", desc: "shell.helpDrawer.tools.bulkPublish.desc" },
      { icon: Pencil, name: "shell.helpDrawer.tools.bulkUpdate.name", desc: "shell.helpDrawer.tools.bulkUpdate.desc" },
      { icon: FileText, name: "shell.helpDrawer.tools.listDrafts.name", desc: "shell.helpDrawer.tools.listDrafts.desc" },
      { icon: Layers, name: "shell.helpDrawer.tools.getSchema.name", desc: "shell.helpDrawer.tools.getSchema.desc" },
      { icon: Trash2, name: "shell.helpDrawer.tools.restoreFromTrash.name", desc: "shell.helpDrawer.tools.restoreFromTrash.desc" },
    ],
  },
  {
    label: "shell.helpDrawer.toolGroups.media",
    tools: [
      { icon: Image, name: "shell.helpDrawer.tools.searchMedia.name", desc: "shell.helpDrawer.tools.searchMedia.desc" },
      { icon: Image, name: "shell.helpDrawer.tools.listMedia.name", desc: "shell.helpDrawer.tools.listMedia.desc" },
      { icon: Image, name: "shell.helpDrawer.tools.upload.name", desc: "shell.helpDrawer.tools.upload.desc" },
    ],
  },
  {
    label: "shell.helpDrawer.toolGroups.aiAgents",
    tools: [
      { icon: Bot, name: "shell.helpDrawer.tools.listAgents.name", desc: "shell.helpDrawer.tools.listAgents.desc" },
      { icon: Bot, name: "shell.helpDrawer.tools.createAgent.name", desc: "shell.helpDrawer.tools.createAgent.desc" },
      { icon: Sparkles, name: "shell.helpDrawer.tools.runAgent.name", desc: "shell.helpDrawer.tools.runAgent.desc" },
      { icon: FileText, name: "shell.helpDrawer.tools.curationQueue.name", desc: "shell.helpDrawer.tools.curationQueue.desc" },
      { icon: CheckCircle2, name: "shell.helpDrawer.tools.approveQueueItem.name", desc: "shell.helpDrawer.tools.approveQueueItem.desc" },
      { icon: XCircle, name: "shell.helpDrawer.tools.rejectQueueItem.name", desc: "shell.helpDrawer.tools.rejectQueueItem.desc" },
      { icon: Bot, name: "shell.helpDrawer.tools.agentTemplates.name", desc: "shell.helpDrawer.tools.agentTemplates.desc" },
      { icon: BarChart3, name: "shell.helpDrawer.tools.agentFeedback.name", desc: "shell.helpDrawer.tools.agentFeedback.desc" },
      { icon: Shield, name: "shell.helpDrawer.tools.agentBudget.name", desc: "shell.helpDrawer.tools.agentBudget.desc" },
      { icon: Globe, name: "shell.helpDrawer.tools.agentLocale.name", desc: "shell.helpDrawer.tools.agentLocale.desc" },
    ],
  },
  {
    label: "shell.helpDrawer.toolGroups.workflows",
    tools: [
      { icon: Workflow, name: "shell.helpDrawer.tools.listWorkflows.name", desc: "shell.helpDrawer.tools.listWorkflows.desc" },
      { icon: Workflow, name: "shell.helpDrawer.tools.createWorkflow.name", desc: "shell.helpDrawer.tools.createWorkflow.desc" },
      { icon: Zap, name: "shell.helpDrawer.tools.runWorkflow.name", desc: "shell.helpDrawer.tools.runWorkflow.desc" },
      { icon: Trash2, name: "shell.helpDrawer.tools.deleteWorkflow.name", desc: "shell.helpDrawer.tools.deleteWorkflow.desc" },
    ],
  },
  {
    label: "shell.helpDrawer.toolGroups.forms",
    tools: [
      { icon: ClipboardList, name: "shell.helpDrawer.tools.listSubmissions.name", desc: "shell.helpDrawer.tools.listSubmissions.desc" },
      { icon: FileText, name: "shell.helpDrawer.tools.readSubmission.name", desc: "shell.helpDrawer.tools.readSubmission.desc" },
      { icon: BarChart3, name: "shell.helpDrawer.tools.formStats.name", desc: "shell.helpDrawer.tools.formStats.desc" },
    ],
  },
  {
    label: "shell.helpDrawer.toolGroups.seoQuality",
    tools: [
      { icon: Gauge, name: "shell.helpDrawer.tools.runLighthouse.name", desc: "shell.helpDrawer.tools.runLighthouse.desc" },
      { icon: Gauge, name: "shell.helpDrawer.tools.lighthouseScores.name", desc: "shell.helpDrawer.tools.lighthouseScores.desc" },
      { icon: Clock, name: "shell.helpDrawer.tools.lighthouseHistory.name", desc: "shell.helpDrawer.tools.lighthouseHistory.desc" },
    ],
  },
  {
    label: "shell.helpDrawer.toolGroups.translation",
    tools: [
      { icon: Languages, name: "shell.helpDrawer.tools.translateDocument.name", desc: "shell.helpDrawer.tools.translateDocument.desc" },
      { icon: Languages, name: "shell.helpDrawer.tools.translateSite.name", desc: "shell.helpDrawer.tools.translateSite.desc" },
    ],
  },
  {
    label: "shell.helpDrawer.toolGroups.interactives",
    tools: [
      { icon: Sparkles, name: "shell.helpDrawer.tools.generateInteractive.name", desc: "shell.helpDrawer.tools.generateInteractive.desc" },
      { icon: Image, name: "shell.helpDrawer.tools.enableImageGeneration.name", desc: "shell.helpDrawer.tools.enableImageGeneration.desc" },
    ],
  },
  {
    label: "shell.helpDrawer.toolGroups.memoryWeb",
    tools: [
      { icon: Brain, name: "shell.helpDrawer.tools.searchMemories.name", desc: "shell.helpDrawer.tools.searchMemories.desc" },
      { icon: Brain, name: "shell.helpDrawer.tools.addMemory.name", desc: "shell.helpDrawer.tools.addMemory.desc" },
      { icon: Trash2, name: "shell.helpDrawer.tools.forgetMemory.name", desc: "shell.helpDrawer.tools.forgetMemory.desc" },
      { icon: Globe, name: "shell.helpDrawer.tools.webSearch.name", desc: "shell.helpDrawer.tools.webSearch.desc" },
      { icon: Globe, name: "shell.helpDrawer.tools.webFetch.name", desc: "shell.helpDrawer.tools.webFetch.desc" },
    ],
  },
  {
    label: "shell.helpDrawer.toolGroups.operations",
    tools: [
      { icon: Send, name: "shell.helpDrawer.tools.deploy.name", desc: "shell.helpDrawer.tools.deploy.desc" },
      { icon: Settings, name: "shell.helpDrawer.tools.buildSite.name", desc: "shell.helpDrawer.tools.buildSite.desc" },
      { icon: Shield, name: "shell.helpDrawer.tools.backup.name", desc: "shell.helpDrawer.tools.backup.desc" },
      { icon: Activity, name: "shell.helpDrawer.tools.linkChecker.name", desc: "shell.helpDrawer.tools.linkChecker.desc" },
      { icon: Settings, name: "shell.helpDrawer.tools.siteSettings.name", desc: "shell.helpDrawer.tools.siteSettings.desc" },
      { icon: Clock, name: "shell.helpDrawer.tools.deployHistory.name", desc: "shell.helpDrawer.tools.deployHistory.desc" },
    ],
  },
  {
    label: "shell.helpDrawer.toolGroups.schedulingHistory",
    tools: [
      { icon: Clock, name: "shell.helpDrawer.tools.schedulePublish.name", desc: "shell.helpDrawer.tools.schedulePublish.desc" },
      { icon: Clock, name: "shell.helpDrawer.tools.calendar.name", desc: "shell.helpDrawer.tools.calendar.desc" },
      { icon: Clock, name: "shell.helpDrawer.tools.revisions.name", desc: "shell.helpDrawer.tools.revisions.desc" },
      { icon: Trash2, name: "shell.helpDrawer.tools.trash.name", desc: "shell.helpDrawer.tools.trash.desc" },
      { icon: BarChart3, name: "shell.helpDrawer.tools.contentStats.name", desc: "shell.helpDrawer.tools.contentStats.desc" },
    ],
  },
];

function AiToolsPage() {
  const t = useT();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", lineHeight: 1.5 }}>
        {t("shell.helpDrawer.aiToolsIntro", { chat: "\u0000" }).split("\u0000").map((part, i) => (
          <span key={i}>{i > 0 && <strong>{t("shell.helpDrawer.chat")}</strong>}{part}</span>
        ))}
      </p>
      {AI_TOOL_GROUPS.map((group) => (
        <div key={group.label}>
          <div style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted-foreground)", marginBottom: "0.5rem" }}>
            {t(group.label)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {group.tools.map((tool) => (
              <div
                key={tool.name}
                style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 8px", borderRadius: "6px" }}
              >
                <tool.icon style={{ width: "14px", height: "14px", color: "var(--primary)", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: "0.8rem", fontWeight: 500 }}>{t(tool.name)}</div>
                  <div style={{ fontSize: "0.65rem", color: "var(--muted-foreground)" }}>{t(tool.desc)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Help button (for header) ───────────────────────────────── */

export function HelpButton() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<DrawerPage>("help");

  // "h" or "?" shortcut → toggle help drawer
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key !== "?" && e.key !== "h") || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || (document.activeElement as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      setPage("help");
      setOpen((o) => !o);
    }
    function onOpenHelp() { setPage("help"); setOpen(true); }
    document.addEventListener("keydown", onKey);
    window.addEventListener("cms:open-help", onOpenHelp);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("cms:open-help", onOpenHelp);
    };
  }, []);

  return (
    <>
      <button
        data-testid="help-button"
        type="button"
        onClick={() => { setPage("help"); setOpen(true); }}
        style={{
          background: "none",
          border: "1.5px solid var(--border)",
          cursor: "pointer",
          color: "var(--muted-foreground)",
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: "50%",
          width: "2rem", height: "2rem",
          padding: 0,
        }}
        className="hover:border-foreground hover:text-foreground transition-colors"
        title={t("shell.helpDrawer.buttonTitle")}
      >
        <HelpCircle style={{ width: "0.95rem", height: "0.95rem" }} />
      </button>
      <HelpDrawer open={open} onClose={() => setOpen(false)} initialPage={page} />
    </>
  );
}
