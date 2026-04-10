"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { safeUUID } from "@/lib/safe-uuid";
import { MessageList, type ChatMessageUI, type ToolCall } from "./message-list";
import { ChatInput } from "./chat-input";
import { WelcomeScreen } from "./welcome-screen";
import { Pencil, Check, X, Trash2, MoreHorizontal, Star, Copy, Brain, Plus, Search, Download, Upload, Package } from "lucide-react";

interface ChatInterfaceProps {
  collections: Array<{ name: string; label: string }>;
  activeSiteId: string;
  visible?: boolean;
}

interface ConversationMeta {
  id: string;
  title: string;
  updatedAt: string;
  starred?: boolean;
}

interface MemoryItem {
  id: string;
  fact: string;
  category: "preference" | "decision" | "pattern" | "correction" | "fact";
  entities: string[];
  createdAt: string;
  updatedAt: string;
  confidence: number;
  hitCount: number;
}

type DrawerTab = "conversations" | "memory";

export function ChatInterface({ collections, activeSiteId, visible }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingText, setThinkingText] = useState("");
  const [thinkingStartTime, setThinkingStartTime] = useState<number | null>(null);
  const [conversationId, setConversationId] = useState(() => safeUUID());
  const [siteName, setSiteName] = useState("your site");
  const [showHistory, setShowHistory] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem("cms-chat-show-thinking") === "true") setShowThinking(true); } catch {}
  }, []);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("conversations");
  const [convSearch, setConvSearch] = useState("");
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memorySearch, setMemorySearch] = useState("");
  const [memoryCount, setMemoryCount] = useState(0);
  const [importResult, setImportResult] = useState<{ chats: { imported: number; skipped: number }; memories: { added: number; skipped: number } } | null>(null);
  const [importPreview, setImportPreview] = useState<{
    manifest: { siteName: string; exportedAt: string; counts: { chats: number; memories: number } } | null;
    chats: { total: number; new: number; existing: number };
    memories: { total: number; new: number; existing: number };
  } | null>(null);
  const pendingImportFile = useRef<File | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Listen for header button events
  useEffect(() => {
    function onNewChat() { handleNewConversation(); }
    function onToggleHist() { loadHistory(); }
    window.addEventListener("chat-new", onNewChat);
    window.addEventListener("chat-toggle-history", onToggleHist);
    return () => {
      window.removeEventListener("chat-new", onNewChat);
      window.removeEventListener("chat-toggle-history", onToggleHist);
    };
  });

  // ESC closes history drawer
  useEffect(() => {
    if (!showHistory) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowHistory(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showHistory]);

  // Fetch site name
  useEffect(() => {
    fetch("/api/admin/site-config")
      .then((r) => r.ok ? r.json() : null)
      .then((d: any) => { if (d?.siteName) setSiteName(d.siteName); })
      .catch(() => {});
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      // Add user message
      const userMsg: ChatMessageUI = {
        id: safeUUID(),
        role: "user",
        content: text,
      };
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      setIsThinking(true);
      setThinkingText("");
      setThinkingStartTime(Date.now());

      // Build API messages (only role + content)
      const apiMessages = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Create assistant message placeholder
      const assistantId = safeUUID();
      const assistantMsg: ChatMessageUI = {
        id: assistantId,
        role: "assistant",
        content: "",
        toolCalls: [],
        isStreaming: true,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // Stream response
      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const response = await fetch("/api/cms/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages, conversationId }),
          signal: abort.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: "Chat request failed" }));
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: `Error: ${err.error ?? "Request failed"}`, isStreaming: false }
                : m
            )
          );
          setIsThinking(false);
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? ""; // Keep incomplete line

          let eventType = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              const data = line.slice(6);
              try {
                const parsed = JSON.parse(data);
                handleSSEEvent(assistantId, eventType, parsed);
              } catch { /* skip parse errors */ }
              eventType = "";
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content || "Connection lost. Please try again.", isStreaming: false }
                : m
            )
          );
        }
      }

      // Finalize streaming message
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m))
      );
      setIsThinking(false);
      setThinkingStartTime(null);
      abortRef.current = null;

      // Save conversation (use ref to get latest messages including streamed AI response)
      saveConversation(conversationId, messagesRef.current);
    },
    [messages, conversationId]
  );

  function handleSSEEvent(assistantId: string, event: string, data: any) {
    switch (event) {
      case "text":
        setIsThinking(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + (data.text ?? "") } : m
          )
        );
        break;

      case "tool_call":
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantId) return m;
            const tc: ToolCall = { tool: data.tool, input: data.input, status: "running" };
            return { ...m, toolCalls: [...(m.toolCalls ?? []), tc] };
          })
        );
        break;

      case "tool_result":
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantId) return m;
            const toolCalls = (m.toolCalls ?? []).map((tc) =>
              tc.tool === data.tool && tc.status === "running"
                ? { ...tc, result: data.result, status: "done" as const }
                : tc
            );
            return { ...m, toolCalls };
          })
        );
        // Notify the rest of the UI when a chat tool modifies content so
        // server-rendered stats (dashboard cards, collection counts) refresh.
        if ([
          "create_document", "update_document", "publish_document",
          "unpublish_document", "trash_document", "restore_from_trash",
          "clone_document", "bulk_publish", "bulk_update", "empty_trash",
          "translate_document", "translate_site",
        ].includes(data.tool)) {
          window.dispatchEvent(new Event("cms:content-changed"));
        }
        break;

      case "form":
        setIsThinking(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, inlineForm: data } : m
          )
        );
        break;

      case "artifact":
        setIsThinking(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, artifact: data } : m
          )
        );
        break;

      case "thinking":
        setThinkingText((prev) => prev + (data.text ?? "") + "\n");
        break;

      case "error":
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content + `\n\nError: ${data.message}`, isStreaming: false }
              : m
          )
        );
        break;
    }
  }

  async function saveConversation(id: string, msgs: ChatMessageUI[]) {
    const title = msgs[0]?.content.slice(0, 60) ?? "New conversation";
    try {
      await fetch("/api/cms/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          title,
          messages: msgs.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: new Date().toISOString(),
            toolCalls: m.toolCalls,
          })),
        }),
      });
    } catch { /* ignore save errors */ }
  }

  function handleNewConversation() {
    setMessages([]);
    setConversationId(safeUUID());
    setShowHistory(false);
  }

  async function loadHistory() {
    setShowHistory((v) => !v);
    if (!showHistory) {
      try {
        const [convRes, memRes] = await Promise.all([
          fetch("/api/cms/chat/conversations"),
          fetch("/api/cms/chat/memory"),
        ]);
        if (convRes.ok) {
          const { conversations: convs } = await convRes.json();
          setConversations(convs ?? []);
        }
        if (memRes.ok) {
          const data = await memRes.json();
          setMemoryCount(data.memories?.length ?? 0);
        }
      } catch { /* ignore */ }
    }
  }

  async function searchChats() {
    try {
      const url = convSearch.trim()
        ? `/api/cms/chat/conversations?q=${encodeURIComponent(convSearch.trim())}`
        : "/api/cms/chat/conversations";
      const res = await fetch(url);
      if (res.ok) {
        const { conversations: convs } = await res.json();
        setConversations(convs ?? []);
      }
    } catch { /* ignore */ }
  }

  async function loadConversation(id: string) {
    try {
      const res = await fetch(`/api/cms/chat/conversations/${id}`);
      if (res.ok) {
        const { conversation } = await res.json();
        setConversationId(conversation.id);
        setMessages(
          (conversation.messages ?? []).map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            toolCalls: m.toolCalls?.map((tc: any) => ({ ...tc, status: "done" })),
          }))
        );
        setShowHistory(false);
      }
    } catch { /* ignore */ }
  }

  async function renameConversation(id: string, newTitle: string) {
    try {
      // Load, rename, save
      const res = await fetch(`/api/cms/chat/conversations/${id}`);
      if (!res.ok) return;
      const { conversation } = await res.json();
      conversation.title = newTitle;
      await fetch("/api/cms/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(conversation),
      });
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
      );
    } catch { /* ignore */ }
  }

  async function toggleStar(id: string) {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    const newStarred = !conv.starred;
    // Optimistic update
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, starred: newStarred } : c))
    );
    try {
      const res = await fetch(`/api/cms/chat/conversations/${id}`);
      if (!res.ok) return;
      const { conversation } = await res.json();
      conversation.starred = newStarred;
      await fetch("/api/cms/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(conversation),
      });
    } catch { /* ignore */ }
  }

  async function deleteConversation(id: string) {
    try {
      await fetch(`/api/cms/chat/conversations/${id}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      // If we deleted the active conversation, start fresh
      if (id === conversationId) {
        handleNewConversation();
      }
    } catch { /* ignore */ }
  }

  async function loadMemories() {
    try {
      const url = memorySearch.trim()
        ? `/api/cms/chat/memory/search?q=${encodeURIComponent(memorySearch.trim())}`
        : "/api/cms/chat/memory";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setMemories(data.memories ?? []);
        if (!memorySearch.trim()) setMemoryCount(data.memories?.length ?? 0);
      }
    } catch { /* ignore */ }
  }

  async function addManualMemory(fact: string) {
    try {
      const res = await fetch("/api/cms/chat/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact, category: "fact" }),
      });
      if (res.ok) loadMemories();
    } catch { /* ignore */ }
  }

  async function deleteMemoryItem(id: string) {
    try {
      await fetch(`/api/cms/chat/memory/${id}`, { method: "DELETE" });
      setMemories((prev) => prev.filter((m) => m.id !== id));
      setMemoryCount((c) => Math.max(0, c - 1));
    } catch { /* ignore */ }
  }

  async function exportAllMemories() {
    try {
      const res = await fetch("/api/cms/chat/memory/export");
      if (!res.ok) return;
      const text = await res.text();
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chat-memories-${new Date().toISOString().split("T")[0]}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  }

  async function importFromFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const res = await fetch("/api/cms/chat/memory/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (res.ok) loadMemories();
      } catch { /* ignore */ }
    };
    input.click();
  }

  async function exportAll() {
    try {
      const res = await fetch("/api/cms/chat/export");
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="(.+)"/);
      a.download = match?.[1] ?? `webhouse-chat-export-${new Date().toISOString().split("T")[0]}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  }

  async function importAll() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      pendingImportFile.current = file;
      try {
        // Step 1: Preview what the import will do
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/cms/chat/import?preview=true", {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const preview = await res.json();
          setImportPreview(preview);
        }
      } catch { /* ignore */ }
    };
    input.click();
  }

  async function confirmImport() {
    const file = pendingImportFile.current;
    if (!file) return;
    pendingImportFile.current = null;
    setImportPreview(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/cms/chat/import", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const result = await res.json();
        // Reload drawer data
        const [convRes, memRes] = await Promise.all([
          fetch("/api/cms/chat/conversations"),
          fetch("/api/cms/chat/memory"),
        ]);
        if (convRes.ok) {
          const { conversations: convs } = await convRes.json();
          setConversations(convs ?? []);
        }
        if (memRes.ok) {
          const data = await memRes.json();
          setMemories(data.memories ?? []);
          setMemoryCount(data.memories?.length ?? 0);
        }
        setImportResult(result);
        setTimeout(() => setImportResult(null), 5000);
      }
    } catch { /* ignore */ }
  }

  function cancelImport() {
    pendingImportFile.current = null;
    setImportPreview(null);
  }

  const handleSuggestionClick = useCallback(
    (message: string) => {
      // If the suggestion ends with a space (e.g. "Search my content for "),
      // don't send — focus the input instead
      if (message.endsWith(" ")) {
        // We'll handle this by setting initial text — for now just send
        handleSend(message.trimEnd());
      } else {
        handleSend(message);
      }
    },
    [handleSend]
  );

  const hasMessages = messages.length > 0;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minHeight: 0,
        backgroundColor: "var(--background)",
      }}
    >
      {/* History drawer — left side panel (ESC to close) */}
      {showHistory && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setShowHistory(false)}
            style={{
              position: "fixed", inset: 0, zIndex: 998,
              backgroundColor: "rgba(0,0,0,0.3)",
            }}
          />
          {/* Drawer */}
          <div
            style={{
              position: "fixed", top: 0, left: 0, bottom: 0, width: "400px", zIndex: 999,
              background: "var(--card)", borderRight: "1px solid var(--border)",
              boxShadow: "4px 0 20px rgba(0,0,0,0.3)",
              display: "flex", flexDirection: "column",
            }}
          >
            {/* Header with tabs */}
            <div style={{ borderBottom: "1px solid var(--border)" }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 16px 0",
              }}>
                <div style={{ display: "flex", gap: "0" }}>
                  <button
                    onClick={() => setDrawerTab("conversations")}
                    style={{
                      background: "none", border: "none", cursor: "pointer", padding: "6px 12px 10px",
                      fontSize: "0.8rem", fontWeight: 600,
                      color: drawerTab === "conversations" ? "var(--foreground)" : "var(--muted-foreground)",
                      borderBottom: drawerTab === "conversations" ? "2px solid var(--primary)" : "2px solid transparent",
                      transition: "all 150ms",
                    }}
                  >
                    Chats
                  </button>
                  <button
                    onClick={() => { setDrawerTab("memory"); loadMemories(); }}
                    style={{
                      background: "none", border: "none", cursor: "pointer", padding: "6px 12px 10px",
                      fontSize: "0.8rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px",
                      color: drawerTab === "memory" ? "var(--foreground)" : "var(--muted-foreground)",
                      borderBottom: drawerTab === "memory" ? "2px solid var(--primary)" : "2px solid transparent",
                      transition: "all 150ms",
                    }}
                  >
                    <Brain style={{ width: "14px", height: "14px" }} />
                    Memory
                    {memoryCount > 0 && (
                      <span style={{
                        fontSize: "0.6rem", padding: "1px 5px", borderRadius: "8px",
                        backgroundColor: "var(--muted)", color: "var(--muted-foreground)",
                        fontWeight: 500, lineHeight: 1.4,
                      }}>
                        {memoryCount}
                      </span>
                    )}
                  </button>
                </div>
                <button
                  onClick={() => setShowHistory(false)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "4px" }}
                >
                  <X style={{ width: "16px", height: "16px" }} />
                </button>
              </div>
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {drawerTab === "conversations" ? (
                <>
                  {/* Search chats */}
                  <div style={{ padding: "10px 16px 6px" }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: "6px",
                      padding: "5px 10px", borderRadius: "6px",
                      border: "1px solid var(--border)", backgroundColor: "var(--background)",
                    }}>
                      <Search style={{ width: "12px", height: "12px", color: "var(--muted-foreground)", flexShrink: 0 }} />
                      <input
                        value={convSearch}
                        onChange={(e) => setConvSearch(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") searchChats(); }}
                        placeholder="Search chats..."
                        style={{
                          flex: 1, border: "none", outline: "none", background: "transparent",
                          fontSize: "0.75rem", color: "var(--foreground)", fontFamily: "inherit",
                        }}
                      />
                      {convSearch && (
                        <button
                          onClick={async () => {
                            setConvSearch("");
                            const res = await fetch("/api/cms/chat/conversations");
                            if (res.ok) { const { conversations: convs } = await res.json(); setConversations(convs ?? []); }
                          }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "0" }}
                        >
                          <X style={{ width: "12px", height: "12px" }} />
                        </button>
                      )}
                    </div>
                  </div>
                  {(() => {
                    const sorted = [...conversations].sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0));
                    return sorted.length === 0 ? (
                      <div style={{ padding: "20px", textAlign: "center", fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
                        {convSearch.trim() ? "No chats match your search" : "No previous chats"}
                      </div>
                    ) : (
                      sorted.map((c) => (
                        <HistoryItem
                          key={c.id}
                          id={c.id}
                          title={c.title}
                          updatedAt={c.updatedAt}
                          isActive={c.id === conversationId}
                          onLoad={() => loadConversation(c.id)}
                          starred={c.starred}
                          onRename={(newTitle) => renameConversation(c.id, newTitle)}
                          onDelete={() => deleteConversation(c.id)}
                          onStar={() => toggleStar(c.id)}
                        />
                      ))
                    );
                  })()}
                </>
              ) : (
                <MemoryPanel
                  memories={memories}
                  search={memorySearch}
                  onSearchChange={(q) => { setMemorySearch(q); }}
                  onSearch={loadMemories}
                  onAdd={addManualMemory}
                  onDelete={deleteMemoryItem}
                  onExport={exportAllMemories}
                  onImport={importFromFile}
                />
              )}
            </div>

            {/* Footer — full export/import */}
            <div style={{
              borderTop: "1px solid var(--border)", padding: "10px 16px",
              display: "flex", flexDirection: "column", gap: "6px",
            }}>
              {/* Import preview confirmation */}
              {importPreview && (
                <div style={{
                  fontSize: "0.72rem", padding: "10px 12px", borderRadius: "6px",
                  border: "1px solid var(--border)", backgroundColor: "var(--muted)",
                }}>
                  <div style={{ fontWeight: 600, marginBottom: "6px" }}>
                    Import from {importPreview.manifest?.siteName ?? "unknown site"}
                  </div>
                  <div style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", marginBottom: "8px" }}>
                    {importPreview.manifest?.exportedAt
                      ? `Exported ${new Date(importPreview.manifest.exportedAt).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
                      : ""}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "3px", fontSize: "0.7rem", marginBottom: "8px" }}>
                    <div>
                      <strong>{importPreview.chats.new}</strong> new chats
                      {importPreview.chats.existing > 0 && (
                        <span style={{ color: "var(--muted-foreground)" }}> ({importPreview.chats.existing} already exist, will skip)</span>
                      )}
                    </div>
                    <div>
                      <strong>{importPreview.memories.new}</strong> new memories
                      {importPreview.memories.existing > 0 && (
                        <span style={{ color: "var(--muted-foreground)" }}> ({importPreview.memories.existing} duplicates, will skip)</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      onClick={confirmImport}
                      style={{
                        flex: 1, padding: "6px 12px", borderRadius: "6px", fontSize: "0.7rem", fontWeight: 600,
                        border: "none", background: "var(--primary)", color: "var(--primary-foreground)",
                        cursor: "pointer",
                      }}
                    >
                      Merge {importPreview.chats.new + importPreview.memories.new} items
                    </button>
                    <button
                      onClick={cancelImport}
                      style={{
                        padding: "6px 12px", borderRadius: "6px", fontSize: "0.7rem",
                        border: "1px solid var(--border)", background: "transparent",
                        color: "var(--muted-foreground)", cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {/* Import result toast */}
              {importResult && (
                <div style={{
                  fontSize: "0.7rem", padding: "6px 10px", borderRadius: "6px",
                  backgroundColor: "color-mix(in srgb, rgb(74 222 128) 10%, transparent)",
                  color: "rgb(74 222 128)",
                }}>
                  Imported {importResult.chats.imported} chats, {importResult.memories.added} memories
                  {(importResult.chats.skipped > 0 || importResult.memories.skipped > 0) &&
                    ` (skipped ${importResult.chats.skipped + importResult.memories.skipped} duplicates)`}
                </div>
              )}
              {/* Export/Import buttons */}
              {!importPreview && (
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    onClick={exportAll}
                    style={{
                      flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                      padding: "7px 12px", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 500,
                      border: "1px solid var(--border)", background: "transparent",
                      color: "var(--foreground)", cursor: "pointer",
                    }}
                  >
                    <Download style={{ width: "13px", height: "13px" }} />
                    Export all
                  </button>
                  <button
                    onClick={importAll}
                    style={{
                      flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                      padding: "7px 12px", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 500,
                      border: "1px solid var(--border)", background: "transparent",
                      color: "var(--foreground)", cursor: "pointer",
                    }}
                  >
                    <Upload style={{ width: "13px", height: "13px" }} />
                    Import .zip
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Main content area */}
      {hasMessages ? (
        <MessageList
          messages={messages}
          isThinking={isThinking}
          thinkingText={thinkingText}
          thinkingStartTime={thinkingStartTime}
          showThinking={showThinking}
        />
      ) : (
        <WelcomeScreen siteName={siteName} onSuggestionClick={handleSuggestionClick} />
      )}

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        disabled={isThinking}
        visible={visible}
        lastUserMessage={messages.filter((m) => m.role === "user").pop()?.content}
      >
        <button
          type="button"
          onClick={() => { const next = !showThinking; setShowThinking(next); localStorage.setItem("cms-chat-show-thinking", String(next)); }}
          title={showThinking ? "Hide thinking process" : "Show thinking process"}
          style={{
            display: "inline-flex", alignItems: "center", gap: "4px",
            padding: "2px 8px", borderRadius: "4px", fontSize: "0.65rem",
            border: "1px solid var(--border)", cursor: "pointer",
            background: showThinking ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent",
            color: showThinking ? "var(--primary)" : "var(--muted-foreground)",
            fontWeight: 500, transition: "all 150ms",
          }}
        >
          <span style={{ fontSize: "0.7rem" }}>💭</span> Thinking
        </button>
      </ChatInput>
    </div>
  );
}

function HistoryItem({ id, title, updatedAt, isActive, starred, onLoad, onRename, onDelete, onStar }: {
  id: string; title: string; updatedAt: string; isActive: boolean; starred?: boolean;
  onLoad: () => void; onRename: (t: string) => void; onDelete: () => void; onStar: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmDelete(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  if (editing) {
    return (
      <div
        style={{
          display: "flex", alignItems: "center", gap: "6px",
          padding: "8px 16px", borderBottom: "1px solid var(--border)",
          backgroundColor: "var(--muted)",
        }}
      >
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { onRename(editValue); setEditing(false); }
            if (e.key === "Escape") { setEditValue(title); setEditing(false); }
          }}
          style={{
            flex: 1, fontSize: "0.8rem", padding: "4px 6px", borderRadius: "4px",
            border: "1px solid var(--border)", backgroundColor: "var(--background)",
            color: "var(--foreground)", outline: "none", fontFamily: "inherit",
          }}
        />
        <button onClick={() => { onRename(editValue); setEditing(false); }}
          style={{ background: "none", border: "none", cursor: "pointer", color: "rgb(74 222 128)", padding: "2px" }}>
          <Check style={{ width: "14px", height: "14px" }} />
        </button>
        <button onClick={() => { setEditValue(title); setEditing(false); }}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "2px" }}>
          <X style={{ width: "14px", height: "14px" }} />
        </button>
      </div>
    );
  }

  const menuItemStyle = {
    display: "flex", alignItems: "center", gap: "8px", width: "100%",
    padding: "7px 12px", border: "none", background: "transparent",
    color: "var(--foreground)", cursor: "pointer", fontSize: "0.75rem",
    borderRadius: "4px", textAlign: "left" as const,
  };

  return (
    <div
      style={{
        display: "flex", alignItems: "center", position: "relative",
        borderBottom: "1px solid var(--border)",
        backgroundColor: isActive ? "var(--muted)" : "transparent",
      }}
      className="hover:bg-muted transition-colors"
    >
      {starred && (
        <Star style={{ width: "10px", height: "10px", color: "#F7BB2E", fill: "#F7BB2E", flexShrink: 0, marginLeft: "10px" }} />
      )}
      <button
        onClick={onLoad}
        style={{
          flex: 1, textAlign: "left", padding: starred ? "10px 8px 10px 6px" : "10px 16px",
          border: "none", backgroundColor: "transparent",
          cursor: "pointer", color: "var(--foreground)",
        }}
      >
        <div style={{ fontSize: "0.8rem", fontWeight: 500, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any, overflow: "hidden" }}>
          {title}
        </div>
        <div style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", marginTop: "2px" }}>
          {new Date(updatedAt).toLocaleString("da-DK", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        </div>
      </button>

      {/* More button */}
      <button
        onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); setConfirmDelete(false); }}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "var(--muted-foreground)", padding: "8px 10px",
          opacity: menuOpen ? 1 : 0.4, flexShrink: 0,
          transition: "opacity 150ms",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
        onMouseLeave={(e) => { if (!menuOpen) e.currentTarget.style.opacity = "0.4"; }}
      >
        <MoreHorizontal style={{ width: "14px", height: "14px" }} />
      </button>

      {/* Dropdown menu */}
      {menuOpen && (
        <div
          ref={menuRef}
          style={{
            position: "absolute", top: "100%", right: "8px", zIndex: 10,
            background: "var(--card)", border: "1px solid var(--border)",
            borderRadius: "8px", padding: "4px", minWidth: "140px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); onStar(); setMenuOpen(false); }}
            style={menuItemStyle}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--muted)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <Star style={{ width: "13px", height: "13px", ...(starred ? { color: "#F7BB2E", fill: "#F7BB2E" } : {}) }} />
            {starred ? "Unstar" : "Star"}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(id); setMenuOpen(false); }}
            style={menuItemStyle}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--muted)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <Copy style={{ width: "13px", height: "13px" }} />
            Copy ID
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setEditing(true); }}
            style={menuItemStyle}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--muted)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <Pencil style={{ width: "13px", height: "13px" }} />
            Rename
          </button>
          {confirmDelete ? (
            <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "5px 12px" }}>
              <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Delete?</span>
              <button onClick={(e) => { e.stopPropagation(); onDelete(); setMenuOpen(false); }}
                style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                  border: "none", background: "var(--destructive)", color: "#fff",
                  cursor: "pointer", lineHeight: 1 }}>Yes</button>
              <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}>No</button>
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
              style={{ ...menuItemStyle, color: "var(--destructive)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <Trash2 style={{ width: "13px", height: "13px" }} />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Memory Panel ──────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  correction: "#ef4444",
  preference: "#8b5cf6",
  decision: "#3b82f6",
  pattern: "#f59e0b",
  fact: "#6b7280",
};

function MemoryPanel({ memories, search, onSearchChange, onSearch, onAdd, onDelete, onExport, onImport }: {
  memories: MemoryItem[];
  search: string;
  onSearchChange: (q: string) => void;
  onSearch: () => void;
  onAdd: (fact: string) => void;
  onDelete: (id: string) => void;
  onExport: () => void;
  onImport: () => void;
}) {
  const [addMode, setAddMode] = useState(false);
  const [addValue, setAddValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addMode) inputRef.current?.focus();
  }, [addMode]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Search */}
      <div style={{ padding: "10px 16px 6px", display: "flex", gap: "6px" }}>
        <div style={{
          flex: 1, display: "flex", alignItems: "center", gap: "6px",
          padding: "5px 10px", borderRadius: "6px",
          border: "1px solid var(--border)", backgroundColor: "var(--background)",
        }}>
          <Search style={{ width: "12px", height: "12px", color: "var(--muted-foreground)", flexShrink: 0 }} />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
            placeholder="Search memories..."
            style={{
              flex: 1, border: "none", outline: "none", background: "transparent",
              fontSize: "0.75rem", color: "var(--foreground)", fontFamily: "inherit",
            }}
          />
        </div>
        <button
          onClick={() => setAddMode(true)}
          title="Add memory"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: "30px", height: "30px", borderRadius: "6px",
            border: "1px solid var(--border)", background: "transparent",
            cursor: "pointer", color: "var(--muted-foreground)", flexShrink: 0,
          }}
        >
          <Plus style={{ width: "14px", height: "14px" }} />
        </button>
        <button
          onClick={onImport}
          title="Import memories"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: "30px", height: "30px", borderRadius: "6px",
            border: "1px solid var(--border)", background: "transparent",
            cursor: "pointer", color: "var(--muted-foreground)", flexShrink: 0,
          }}
        >
          <Upload style={{ width: "14px", height: "14px" }} />
        </button>
        <button
          onClick={onExport}
          title="Export memories"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: "30px", height: "30px", borderRadius: "6px",
            border: "1px solid var(--border)", background: "transparent",
            cursor: "pointer", color: "var(--muted-foreground)", flexShrink: 0,
          }}
        >
          <Download style={{ width: "14px", height: "14px" }} />
        </button>
      </div>

      {/* Add memory input */}
      {addMode && (
        <div style={{ padding: "4px 16px 8px", display: "flex", gap: "6px" }}>
          <input
            ref={inputRef}
            value={addValue}
            onChange={(e) => setAddValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && addValue.trim()) {
                onAdd(addValue.trim());
                setAddValue("");
                setAddMode(false);
              }
              if (e.key === "Escape") { setAddValue(""); setAddMode(false); }
            }}
            placeholder="Type a fact to remember..."
            style={{
              flex: 1, fontSize: "0.75rem", padding: "5px 8px", borderRadius: "6px",
              border: "1px solid var(--primary)", backgroundColor: "var(--background)",
              color: "var(--foreground)", outline: "none", fontFamily: "inherit",
            }}
          />
          <button
            onClick={() => {
              if (addValue.trim()) {
                onAdd(addValue.trim());
                setAddValue("");
                setAddMode(false);
              }
            }}
            style={{
              background: "var(--primary)", color: "var(--primary-foreground)",
              border: "none", borderRadius: "6px", padding: "4px 10px",
              fontSize: "0.7rem", fontWeight: 500, cursor: "pointer",
            }}
          >
            Save
          </button>
          <button
            onClick={() => { setAddValue(""); setAddMode(false); }}
            style={{
              background: "transparent", border: "1px solid var(--border)",
              borderRadius: "6px", padding: "4px 8px",
              fontSize: "0.7rem", cursor: "pointer", color: "var(--muted-foreground)",
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Memory list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {memories.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
            {search.trim() ? "No memories match your search" : "No memories yet. Chat will learn over time."}
          </div>
        ) : (
          memories.map((m) => (
            <MemoryRow key={m.id} memory={m} onDelete={() => onDelete(m.id)} />
          ))
        )}
      </div>
    </div>
  );
}

function MemoryRow({ memory, onDelete }: { memory: MemoryItem; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);

  return (
    <div
      style={{
        padding: "10px 16px", borderBottom: "1px solid var(--border)",
        fontSize: "0.8rem", lineHeight: 1.5,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
            <span style={{
              fontSize: "0.6rem", padding: "1px 6px", borderRadius: "4px",
              fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em",
              color: "#fff",
              backgroundColor: CATEGORY_COLORS[memory.category] ?? "#6b7280",
            }}>
              {memory.category}
            </span>
            {memory.hitCount > 0 && (
              <span style={{ fontSize: "0.6rem", color: "var(--muted-foreground)" }}>
                {memory.hitCount}x used
              </span>
            )}
          </div>
          <div style={{ color: "var(--foreground)" }}>{memory.fact}</div>
          {memory.entities.length > 0 && (
            <div style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", marginTop: "2px" }}>
              {memory.entities.join(", ")}
            </div>
          )}
        </div>
        <div style={{ flexShrink: 0 }}>
          {confirm ? (
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Remove?</span>
              <button onClick={onDelete}
                style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                  border: "none", background: "var(--destructive)", color: "#fff",
                  cursor: "pointer", lineHeight: 1 }}>Yes</button>
              <button onClick={() => setConfirm(false)}
                style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}>No</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirm(true)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--muted-foreground)", padding: "2px", opacity: 0.5,
                transition: "opacity 150ms",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.5"; }}
            >
              <X style={{ width: "12px", height: "12px" }} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
