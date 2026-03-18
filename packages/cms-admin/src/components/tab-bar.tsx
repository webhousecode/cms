"use client";

import { X, Plus, LayoutDashboard, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";

const STATUS_DOT: Record<string, { color: string; title: string }> = {
  published: { color: "rgb(74 222 128)",  title: "Published" },
  draft:     { color: "rgb(234 179 8)",   title: "Draft" },
  scheduled: { color: "rgb(139 92 246)",  title: "Scheduled" },
  expired:   { color: "rgb(239 68 68)",   title: "Expired" },
  trashed:   { color: "rgb(248 113 113)", title: "Trashed" },
};
import { useTabs } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";

const TAB_MAX_WIDTH = 180;

export function TabBar() {
  const { tabs, activeId, openTab, closeTab, closeAllTabs, switchTab } = useTabs();
  const [showCloseAll, setShowCloseAll] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    fetch("/api/admin/user-state")
      .then((r) => r.json())
      .then((d: { showCloseAllTabs?: boolean }) => setShowCloseAll(d.showCloseAllTabs ?? false))
      .catch(() => {});

    function onUserStateUpdate(e: Event) {
      const detail = (e as CustomEvent<{ showCloseAllTabs?: boolean }>).detail;
      if (detail.showCloseAllTabs !== undefined) setShowCloseAll(detail.showCloseAllTabs);
    }
    window.addEventListener("cms:user-state-updated", onUserStateUpdate);
    return () => window.removeEventListener("cms:user-state-updated", onUserStateUpdate);
  }, []);

  useEffect(() => {
    if (!confirmOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setConfirmOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmOpen]);

  if (tabs.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "stretch",
        backgroundColor: "var(--background)",
        borderBottom: "1px solid var(--border)",
        position: "sticky",
        top: 48,
        zIndex: 40,
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => switchTab(tab.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              padding: "0 0.625rem 0 0.75rem",
              minWidth: "80px",
              maxWidth: `${TAB_MAX_WIDTH}px`,
              height: "36px",
              cursor: "pointer",
              userSelect: "none",
              flexShrink: 0,
              borderRight: "1px solid var(--border)",
              borderBottom: isActive ? "2px solid var(--primary)" : "2px solid transparent",
              backgroundColor: isActive ? "var(--card)" : "transparent",
            }}
            className={cn(
              "group transition-colors",
              !isActive && "hover:bg-accent/40"
            )}
          >
            {/* Tab icon */}
            <LayoutDashboard
              style={{
                width: "0.75rem",
                height: "0.75rem",
                flexShrink: 0,
                color: isActive ? "var(--primary)" : "var(--muted-foreground)",
                opacity: 0.7,
              }}
            />

            {/* Status dot */}
            {tab.status && STATUS_DOT[tab.status] && (
              <span
                title={STATUS_DOT[tab.status]!.title}
                style={{
                  flexShrink: 0,
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor: STATUS_DOT[tab.status]!.color,
                  boxShadow: `0 0 4px ${STATUS_DOT[tab.status]!.color}`,
                }}
              />
            )}

            {/* Title */}
            <span
              style={{
                flex: 1,
                fontSize: "0.75rem",
                color: isActive ? "var(--foreground)" : "var(--muted-foreground)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontWeight: isActive ? 500 : 400,
              }}
              title={tab.title}
            >
              {tab.title}
            </span>

            {/* Close button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              style={{
                flexShrink: 0,
                width: "16px",
                height: "16px",
                borderRadius: "3px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--muted-foreground)",
                padding: 0,
              }}
              className="opacity-0 group-hover:opacity-100 hover:!bg-accent hover:!text-foreground transition-opacity"
              title="Close tab (⌥W)"
            >
              <X style={{ width: "10px", height: "10px" }} />
            </button>
          </div>
        );
      })}

      {/* New tab button — always last in the wrap flow */}
      <button
        type="button"
        onClick={() => openTab("/admin", "Dashboard", true)}
        style={{
          flexShrink: 0,
          width: "36px",
          height: "36px",
          border: "none",
          borderLeft: "1px solid var(--border)",
          background: "transparent",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--muted-foreground)",
        }}
        className="hover:bg-accent/40 hover:text-foreground transition-colors"
        title="New tab (⌘click any link)"
      >
        <Plus style={{ width: "14px", height: "14px" }} />
      </button>

      {/* Close All pill — only when user setting is on and there are multiple tabs */}
      {showCloseAll && tabs.length > 1 && (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          style={{
            flexShrink: 0,
            alignSelf: "center",
            marginLeft: "0.375rem",
            padding: "0.15rem 0.45rem",
            borderRadius: "4px",
            border: "1px solid hsl(38 60% 55% / 0.5)",
            background: "transparent",
            color: "hsl(38 92% 48%)",
            fontSize: "0.68rem",
            cursor: "pointer",
            whiteSpace: "nowrap",
            lineHeight: 1.4,
          }}
          title="Close all tabs"
        >
          Close all
        </button>
      )}

      {/* Confirm close-all dialog */}
      {confirmOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmOpen(false); }}
        >
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "1.5rem", minWidth: "320px", maxWidth: "420px", boxShadow: "0 8px 32px rgba(0,0,0,0.4)", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
              <AlertTriangle style={{ width: "18px", height: "18px", color: "var(--destructive)", flexShrink: 0, marginTop: "1px" }} />
              <p style={{ fontSize: "0.9rem", color: "var(--foreground)", margin: 0 }}>
                Close all {tabs.length} tabs? All open documents will be closed and you'll return to Dashboard.
              </p>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button type="button" onClick={() => setConfirmOpen(false)} style={{ padding: "0.4rem 0.875rem", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", fontSize: "0.8rem", cursor: "pointer" }}>Cancel</button>
              <button type="button" onClick={() => { setConfirmOpen(false); closeAllTabs(); }} style={{ padding: "0.4rem 0.875rem", borderRadius: "6px", border: "none", background: "var(--destructive)", color: "#fff", fontSize: "0.8rem", cursor: "pointer" }}>Close all</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
